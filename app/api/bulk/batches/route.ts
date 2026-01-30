export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllBatches, getBatch, deleteBatch, getBatchSubmissions, getSubmission, updateBatchStats } from '@/lib/batch-store';
import { deleteFile, isR2Configured } from '@/lib/r2';
import { kv } from '@vercel/kv';

// GET /api/bulk/batches - List all batches
export async function GET() {
  try {
    const batches = await getAllBatches();
    const hydrated = await Promise.all(
      batches.map(async (batch) => {
        // ============================================
        // SUBMISSION IDS: Merge from batch record AND Redis SET
        // Ensures we never lose submissions during parallel upload race conditions
        // ============================================
        const batchIds = batch.submissionIds || [];
        const setIds = await kv.smembers(`batch_submissions:${batch.id}`) as string[];
        const submissionIds = Array.from(new Set([...batchIds, ...setIds]));
        
        // Fetch all submissions (regardless of status)
        const submissions = (await Promise.all(submissionIds.map(id => getSubmission(id)))).filter(Boolean);
        const validSubmissions = submissions;
        
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
        
        console.log(`[Batches] Batch ${batch.id}: ${validSubmissions.length} submissions, graded=${gradedCount}, ready=${readyCount}, failed=${failedCount}, processing=${processingCount}`);
        
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
          // Clear expected count once all files are uploaded
          expectedUploadCount: uploadsComplete ? undefined : batch.expectedUploadCount,
        };
      })
    );

    return NextResponse.json({ success: true, batches: hydrated });
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

