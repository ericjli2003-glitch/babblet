export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllBatches, getBatch, deleteBatch, getBatchSubmissions, getSubmission, updateBatchStats } from '@/lib/batch-store';
import { deleteFile, isR2Configured } from '@/lib/r2';
import { kv } from '@vercel/kv';

// ============================================
// SUBMISSION VISIBILITY: Single source of truth
// All submissions with a valid submission.id are counted and displayed.
// Processing state is represented at UI level, not by filtering rows.
// This recovery logic matches /api/bulk/status for consistency.
// ============================================
async function recoverBatchSubmissions(batchId: string, existingIds: Set<string>) {
  const recovered: string[] = [];

  // Try 1: Check the queue for queued submissions
  const queueItems = await kv.lrange('submission_queue', 0, -1) as string[];
  console.log(`[Batches] Queue has ${queueItems?.length || 0} items for recovery`);
  
  for (const subId of queueItems || []) {
    if (existingIds.has(subId)) continue;
    const sub = await getSubmission(subId as string);
    if (sub && sub.batchId === batchId) {
      await kv.sadd(`batch_submissions:${batchId}`, subId);
      recovered.push(subId as string);
      existingIds.add(subId);
    }
  }

  // Try 2: Scan for orphaned submission keys
  let cursor = 0;
  let scanCount = 0;
  const maxScans = 20; // Match status route for consistency

  do {
    // eslint-disable-next-line
    const result: [number, string[]] = await kv.scan(cursor, { match: 'submission:*', count: 100 }) as any;
    cursor = result[0];
    const keys = result[1];

    for (const key of keys) {
      const subId = key.replace('submission:', '');
      if (existingIds.has(subId)) continue;
      
      const sub = await getSubmission(subId);
      if (sub && sub.batchId === batchId) {
        await kv.sadd(`batch_submissions:${batchId}`, subId);
        recovered.push(subId);
        existingIds.add(subId);
      }
    }

    scanCount++;
  } while (cursor !== 0 && scanCount < maxScans);

  return recovered;
}

// GET /api/bulk/batches - List all batches
export async function GET() {
  try {
    const batches = await getAllBatches();
    const hydrated = await Promise.all(
      batches.map(async (batch) => {
        // ============================================
        // SUBMISSION VISIBILITY: Single source of truth
        // Count is based on existence of submission records, not status.
        // This matches /api/bulk/status for consistency between pages.
        // ============================================
        
        // Get raw submission IDs from the KV set
        let submissionIds = await kv.smembers(`batch_submissions:${batch.id}`) as string[];
        // #region agent log
        (()=>{const d={location:'api/bulk/batches/route.ts:batches-map',message:'Batches GET per batch',data:{batchId:batch.id,batchName:batch.name,setSize:submissionIds.length,batchTotalSubmissions:batch.totalSubmissions},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'};fetch('http://127.0.0.1:7242/ingest/4d4a084e-4174-46b3-8733-338fa5664bc9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});try{const p=require('path'),fs=require('fs'),lp=p.join(process.cwd(),'.cursor','debug.log');fs.mkdirSync(p.dirname(lp),{recursive:true});fs.appendFileSync(lp,JSON.stringify(d)+'\n');}catch(_){}})();
        // #endregion
        
        // Fetch all submissions (regardless of status)
        let submissions = (await Promise.all(submissionIds.map(id => getSubmission(id)))).filter(Boolean);
        
        // ALWAYS try to recover if batch claims more submissions than we found
        // This ensures consistency with the detail page (status route)
        if (batch.totalSubmissions > submissions.length || submissions.length === 0) {
          console.log(`[Batches] Recovery needed for ${batch.id}. Batch claims ${batch.totalSubmissions}, found ${submissions.length}`);
          const existingIds = new Set(submissions.map(s => s!.id));
          const recovered = await recoverBatchSubmissions(batch.id, existingIds);
          
          if (recovered.length > 0) {
            // Re-fetch to include recovered submissions
            submissionIds = await kv.smembers(`batch_submissions:${batch.id}`) as string[];
            submissions = (await Promise.all(submissionIds.map(id => getSubmission(id)))).filter(Boolean);
            console.log(`[Batches] After recovery: ${submissions.length} submissions`);
          }
        }
        
        // De-duplicate in case recovery added duplicates
        const deduped = new Map(submissions.map(s => [s!.id, s]));
        const validSubmissions = Array.from(deduped.values()).filter(Boolean);
        // #region agent log
        (()=>{const d={location:'api/bulk/batches/route.ts:after-dedup',message:'Batches GET after recovery/dedup',data:{batchId:batch.id,validSubmissionsLength:validSubmissions.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'};fetch('http://127.0.0.1:7242/ingest/4d4a084e-4174-46b3-8733-338fa5664bc9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});try{const p=require('path'),fs=require('fs'),lp=p.join(process.cwd(),'.cursor','debug.log');fs.mkdirSync(p.dirname(lp),{recursive:true});fs.appendFileSync(lp,JSON.stringify(d)+'\n');}catch(_){}})();
        // #endregion
        
        // ============================================
        // GRADING STATUS: Single source of truth
        // A submission is "graded" ONLY if it has an actual score (overallScore defined)
        // This matches computeGradingStatus in /api/bulk/status/route.ts
        // ============================================
        const gradedCount = validSubmissions.filter(s => 
          s!.status === 'ready' && 
          s!.rubricEvaluation?.overallScore !== undefined && 
          s!.rubricEvaluation?.overallScore !== null
        ).length;
        const failedCount = validSubmissions.filter(s => s!.status === 'failed').length;
        const readyCount = validSubmissions.filter(s => s!.status === 'ready').length;
        const processingCount = validSubmissions.filter(s => 
          s!.status === 'transcribing' || s!.status === 'analyzing' || s!.status === 'queued'
        ).length;
        
        // ============================================
        // CLASS AVERAGE: Compute from graded submission scores
        // ============================================
        const scores = validSubmissions
          .filter(s => s!.rubricEvaluation?.overallScore !== undefined && s!.rubricEvaluation?.overallScore !== null)
          .map(s => s!.rubricEvaluation!.overallScore);
        const averageScore = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : undefined;
        
        console.log(`[Batches] Batch ${batch.id}: ${validSubmissions.length} submissions, graded=${gradedCount}, ready=${readyCount}, failed=${failedCount}, processing=${processingCount}, avg=${averageScore ?? '--'}`);
        
        // ============================================
        // GRADING STATUS: Compute from actual grade data
        // Only mark completed when ALL submissions have actual scores
        // ============================================
        let status = batch.status;
        if (validSubmissions.length > 0) {
          // All submissions have actual grades
          if (gradedCount === validSubmissions.length) {
            status = 'completed';
          // All finished (ready or failed) but some missing grades - still processing/finalizing
          } else if (readyCount + failedCount === validSubmissions.length) {
            status = 'processing'; // Finalizing - scores being written
          } else if (processingCount > 0 || gradedCount > 0) {
            status = 'processing';
          }
        }
        
        // ============================================
        // UPLOAD TRACKING: Clear expectedUploadCount when all files are uploaded
        // ============================================
        const uploadsComplete = batch.expectedUploadCount !== undefined && 
                               batch.expectedUploadCount > 0 && 
                               validSubmissions.length >= batch.expectedUploadCount;
        
        // ============================================
        // SUBMISSION VISIBILITY: Return actual submission count
        // totalSubmissions reflects existing records, not filtered by status
        // ============================================
        return {
          ...batch,
          totalSubmissions: validSubmissions.length,
          processedCount: gradedCount, // Use gradedCount for accurate reporting
          failedCount,
          status,
          averageScore,
          // Clear expected count once all files are uploaded
          expectedUploadCount: uploadsComplete ? undefined : batch.expectedUploadCount,
        };
      })
    );

    return NextResponse.json({ success: true, batches: hydrated }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    console.error('[Batches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/bulk/batches?id=xxx - Delete a batch
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');

    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    console.log(`[DeleteBatch] Deleting batch ${batchId}: ${batch.name}`);

    // Get all submissions to delete their R2 files
    const submissions = await getBatchSubmissions(batchId);
    console.log(`[DeleteBatch] Found ${submissions.length} submissions to delete`);

    // Delete files from R2
    if (isR2Configured() && submissions.length > 0) {
      const deletePromises = submissions.map(async (sub) => {
        if (sub.fileKey) {
          try {
            await deleteFile(sub.fileKey);
            console.log(`[DeleteBatch] Deleted R2 file: ${sub.fileKey}`);
          } catch (err) {
            // Log but don't fail - file might already be deleted
            console.warn(`[DeleteBatch] Failed to delete R2 file ${sub.fileKey}:`, err);
          }
        }
      });
      
      await Promise.allSettled(deletePromises);
      console.log(`[DeleteBatch] R2 file cleanup complete`);
    }

    // Delete KV records
    await deleteBatch(batchId);
    console.log(`[DeleteBatch] KV records deleted for batch ${batchId}`);

    return NextResponse.json({ 
      success: true, 
      deletedFiles: submissions.length 
    });
  } catch (error) {
    console.error('[DeleteBatch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

