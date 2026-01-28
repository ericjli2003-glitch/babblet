export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getQueueLength, getSubmission, updateBatch, updateBatchStats } from '@/lib/batch-store';
import { kv } from '@vercel/kv';

// ============================================
// GRADING STATUS: Single Source of Truth
// Status is computed from actual submission data, not stored counts
// ============================================
export type GradingStatus = 
  | 'not_started'   // No submissions or all queued
  | 'in_progress'   // Some processing or some graded but not all
  | 'completed'     // All submissions have grades (overallScore defined)
  | 'error';        // Mismatch: status says ready but no grade data

/**
 * Computes the authoritative grading status from submission data.
 * A submission is "graded" only if it has an actual score, not just status='ready'.
 */
function computeGradingStatus(submissions: Array<{
  status: string;
  overallScore?: number;
}>): { status: GradingStatus; gradedCount: number; totalCount: number; message: string } {
  const totalCount = submissions.length;
  
  if (totalCount === 0) {
    return { status: 'not_started', gradedCount: 0, totalCount: 0, message: 'No submissions' };
  }
  
  // Count submissions that actually have grade data (score defined)
  const gradedCount = submissions.filter(s => 
    s.status === 'ready' && s.overallScore !== undefined && s.overallScore !== null
  ).length;
  
  // Count by status
  const readyCount = submissions.filter(s => s.status === 'ready').length;
  const failedCount = submissions.filter(s => s.status === 'failed').length;
  const processingCount = submissions.filter(s => 
    s.status === 'transcribing' || s.status === 'analyzing'
  ).length;
  const queuedCount = submissions.filter(s => s.status === 'queued').length;
  
  // All finished (ready or failed)
  const allFinished = (readyCount + failedCount) === totalCount;
  
  // Check for error state: status says ready but no score
  const readyWithoutScore = submissions.filter(s => 
    s.status === 'ready' && (s.overallScore === undefined || s.overallScore === null)
  ).length;
  
  if (allFinished && readyWithoutScore > 0) {
    return { 
      status: 'error', 
      gradedCount, 
      totalCount,
      message: `${readyWithoutScore} submission(s) marked ready but missing grade data`
    };
  }
  
  if (gradedCount === totalCount) {
    return { 
      status: 'completed', 
      gradedCount, 
      totalCount,
      message: 'All submissions successfully evaluated'
    };
  }
  
  if (processingCount > 0 || gradedCount > 0) {
    return { 
      status: 'in_progress', 
      gradedCount, 
      totalCount,
      message: `${gradedCount} of ${totalCount} completed`
    };
  }
  
  if (queuedCount === totalCount) {
    return { 
      status: 'not_started', 
      gradedCount: 0, 
      totalCount,
      message: 'Awaiting grading'
    };
  }
  
  return { 
    status: 'in_progress', 
    gradedCount, 
    totalCount,
    message: `${gradedCount} of ${totalCount} completed`
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    let batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Pull submission IDs directly from the KV set for consistency
    let submissionIds = await kv.smembers(`batch_submissions:${batchId}`) as string[];
    console.log(`[Status] BatchId=${batchId} Raw submission IDs in set (${submissionIds.length}):`, submissionIds);
    
    let submissions = (await Promise.all(submissionIds.map(id => getSubmission(id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getSubmission>>>[];
    console.log(`[Status] BatchId=${batchId} Found ${submissions.length} valid submissions from set`);
    
    // ALWAYS try to recover if batch claims more submissions than we found
    // This handles cases where submissions exist but weren't added to the set
    if (batch.totalSubmissions > submissions.length || submissions.length === 0) {
      console.log(`[Status] Recovery needed. Batch claims ${batch.totalSubmissions}, found ${submissions.length}`);
      
      const existingIds = new Set(submissions.map(s => s.id));
      
      // Try 1: Check the queue for queued submissions
      const queueItems = await kv.lrange('submission_queue', 0, -1) as string[];
      console.log(`[Status] Queue has ${queueItems?.length || 0} items`);
      
      for (const subId of queueItems || []) {
        if (existingIds.has(subId)) continue;
        const sub = await getSubmission(subId);
        if (sub && sub.batchId === batchId) {
          submissions.push(sub);
          existingIds.add(sub.id);
          await kv.sadd(`batch_submissions:${batchId}`, subId);
          console.log(`[Status] Recovered submission ${subId} from queue`);
        }
      }
      
      // Try 2: Scan for submission keys that belong to this batch
      console.log(`[Status] Scanning for orphaned submissions...`);
      let cursor = 0;
      let scanCount = 0;
      const maxScans = 20; // Increased limit for better recovery
      
      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: [number, string[]] = await kv.scan(cursor, { match: 'submission:*', count: 100 }) as any;
        cursor = result[0];
        const keys = result[1];
        
        for (const key of keys) {
          const subId = key.replace('submission:', '');
          if (existingIds.has(subId)) continue;
          
          const sub = await getSubmission(subId);
          if (sub && sub.batchId === batchId) {
            submissions.push(sub);
            existingIds.add(sub.id);
            await kv.sadd(`batch_submissions:${batchId}`, subId);
            console.log(`[Status] Recovered orphaned submission ${subId}`);
          }
        }
        
        scanCount++;
      } while (cursor !== 0 && scanCount < maxScans);
      
      console.log(`[Status] After recovery: ${submissions.length} submissions`);
    }
    
    // De-duplicate in case recovery added duplicates
    const deduped = new Map(submissions.map(s => [s.id, s]));
    submissions = Array.from(deduped.values());
    
    // Compute grading status from actual submission data (SINGLE SOURCE OF TRUTH)
    const submissionData = submissions.map(s => ({
      status: s.status,
      overallScore: s.rubricEvaluation?.overallScore,
    }));
    const gradingStatusResult = computeGradingStatus(submissionData);
    
    // Sync batch stats to match actual graded count (submissions with scores)
    const processedCount = gradingStatusResult.gradedCount;
    const failedCount = submissions.filter(s => s.status === 'failed').length;
    
    // Map grading status to batch status for backward compatibility
    const batchStatus = gradingStatusResult.status === 'completed' ? 'completed' 
                      : gradingStatusResult.status === 'not_started' ? 'active'
                      : 'processing';
    
    if (batch.totalSubmissions !== submissions.length || 
        batch.processedCount !== processedCount || 
        batch.failedCount !== failedCount ||
        batch.status !== batchStatus) {
      console.log(`[Status] Syncing batch stats: total ${batch.totalSubmissions}->${submissions.length}, processed ${batch.processedCount}->${processedCount}, status ${batch.status}->${batchStatus}`);
      batch = await updateBatch(batchId, {
        totalSubmissions: submissions.length,
        processedCount,
        failedCount,
        status: batchStatus,
      }) || batch;
    }

    const queueLength = await getQueueLength();

    // Calculate stats
    const stats = {
      total: submissions.length,
      queued: submissions.filter(s => s.status === 'queued').length,
      uploading: submissions.filter(s => s.status === 'uploading').length,
      transcribing: submissions.filter(s => s.status === 'transcribing').length,
      analyzing: submissions.filter(s => s.status === 'analyzing').length,
      ready: submissions.filter(s => s.status === 'ready').length,
      failed: submissions.filter(s => s.status === 'failed').length,
    };

    return NextResponse.json({
      success: true,
      batch,
      // GRADING STATUS: Single source of truth for UI consistency
      gradingStatus: {
        status: gradingStatusResult.status,
        gradedCount: gradingStatusResult.gradedCount,
        totalCount: gradingStatusResult.totalCount,
        message: gradingStatusResult.message,
      },
      submissions: submissions.map(s => ({
        id: s.id,
        studentName: s.studentName,
        originalFilename: s.originalFilename,
        status: s.status,
        errorMessage: s.errorMessage,
        // Only report score if actually defined (not undefined/null)
        overallScore: s.rubricEvaluation?.overallScore ?? null,
        hasGradeData: s.rubricEvaluation?.overallScore !== undefined && s.rubricEvaluation?.overallScore !== null,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
      stats,
      globalQueueLength: queueLength,
    });
  } catch (error) {
    console.error('[Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

