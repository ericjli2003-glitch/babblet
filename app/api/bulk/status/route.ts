export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getQueueLength, getSubmission, updateBatch, updateBatchStats } from '@/lib/batch-store';
import { kv } from '@vercel/kv';

// ============================================
// GRADING STATUS: Single Source of Truth
// Grading is fully automated - no instructor action required.
// Status is computed from actual submission data, not stored counts.
// ============================================
export type GradingStatus = 
  | 'not_started'   // No submissions or all queued, awaiting automated processing
  | 'processing'    // Automated grading in progress
  | 'finalizing'    // Processing complete, awaiting final results
  | 'completed'     // All submissions have grades (overallScore defined)
  | 'retrying';     // System is retrying failed automated grading

/**
 * Computes the authoritative grading status from submission data.
 * Grading is fully automated - these are system states, not user action states.
 * A submission is "graded" only if it has an actual score, not just status='ready'.
 */
function computeGradingStatus(submissions: Array<{
  status: string;
  overallScore?: number;
}>): { status: GradingStatus; gradedCount: number; totalCount: number; message: string } {
  const totalCount = submissions.length;
  
  if (totalCount === 0) {
    return { status: 'not_started', gradedCount: 0, totalCount: 0, message: 'No submissions yet' };
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
  
  // Check for finalizing state: status says ready but score not yet available
  // This is a system state - the automated grading is finalizing results
  const readyWithoutScore = submissions.filter(s => 
    s.status === 'ready' && (s.overallScore === undefined || s.overallScore === null)
  ).length;
  
  if (allFinished && readyWithoutScore > 0) {
    return { 
      status: 'finalizing', 
      gradedCount, 
      totalCount,
      message: 'Finalizing automated grading results'
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
  
  // Some failed - system may retry
  if (failedCount > 0 && gradedCount + failedCount === totalCount) {
    return {
      status: 'retrying',
      gradedCount,
      totalCount,
      message: `${failedCount} submission(s) being retried`
    };
  }
  
  if (processingCount > 0 || gradedCount > 0) {
    return { 
      status: 'processing', 
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
      message: 'Queued for automated grading'
    };
  }
  
  return { 
    status: 'processing', 
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

    // ============================================
    // SUBMISSION IDS: Redis SET is the ONLY source of truth
    // The batch array is a cache that can get out of sync during race conditions
    // ALWAYS rebuild from the SET to ensure we never lose submissions
    // ============================================
    let setIds: string[] = [];
    try {
      setIds = await kv.smembers(`batch_submissions:${batchId}`) as string[];
    } catch (e) {
      console.log(`[Status] Failed to read SET for batch ${batchId}:`, e);
    }
    const batchIds = batch.submissionIds || [];
    
    // Merge both sources - use Set to dedupe, but SET is authoritative
    let submissionIds = Array.from(new Set([...setIds, ...batchIds]));
    
    // ============================================
    // FALLBACK: If we found 0 submissions but batch.totalSubmissions > 0,
    // the SET might have been lost. Use a scan as last resort.
    // ============================================
    if (submissionIds.length === 0 && batch.totalSubmissions > 0) {
      console.log(`[Status] RECOVERY: batch ${batchId} claims ${batch.totalSubmissions} submissions but SET/array empty. Attempting scan recovery...`);
      console.log(`[Status] Batch record: submissionIds=${JSON.stringify(batchIds)}, totalSubmissions=${batch.totalSubmissions}, processedCount=${batch.processedCount}`);
      try {
        // Scan ALL submission keys - no limit since we need to find them
        const allSubmissionKeys = await kv.keys('submission:*');
        console.log(`[Status] RECOVERY: Scanning ${allSubmissionKeys.length} total submission keys...`);
        let foundCount = 0;
        for (const key of allSubmissionKeys) {
          const subId = (key as string).replace('submission:', '');
          const sub = await getSubmission(subId);
          if (sub && sub.batchId === batchId) {
            submissionIds.push(subId);
            foundCount++;
            console.log(`[Status] RECOVERY: Found submission ${subId} (${sub.studentName})`);
          }
          // Stop if we've found enough
          if (foundCount >= batch.totalSubmissions) break;
        }
        console.log(`[Status] RECOVERY: Found ${submissionIds.length} submissions via scan for batch ${batchId}`);
        // Re-sync to SET and batch
        if (submissionIds.length > 0) {
          console.log(`[Status] RECOVERY: Re-syncing ${submissionIds.length} submissions to SET and batch record`);
          for (const id of submissionIds) {
            await kv.sadd(`batch_submissions:${batchId}`, id);
          }
          await updateBatch(batchId, { submissionIds, totalSubmissions: submissionIds.length });
          batch = await getBatch(batchId) || batch;
        } else {
          // No submissions found - batch record is stale
          console.log(`[Status] RECOVERY: No submissions found. Resetting batch stats to 0.`);
          await updateBatch(batchId, { submissionIds: [], totalSubmissions: 0, processedCount: 0, failedCount: 0 });
          batch = await getBatch(batchId) || batch;
        }
      } catch (e) {
        console.log(`[Status] RECOVERY failed:`, e);
      }
    }
    
    // ALWAYS sync batch record if there's ANY mismatch (count or IDs)
    const batchNeedsSync = submissionIds.length !== batchIds.length || 
      !submissionIds.every(id => batchIds.includes(id));
    
    if (batchNeedsSync) {
      console.log(`[Status] Syncing batch ${batchId}: batch had ${batchIds.length} IDs, SET has ${setIds.length}, merged to ${submissionIds.length}`);
      await updateBatch(batchId, {
        submissionIds: submissionIds,
        totalSubmissions: submissionIds.length,
      });
      // Refresh batch after sync
      batch = await getBatch(batchId) || batch;
    }
    
    console.log(`[Status] BatchId=${batchId} Found ${submissionIds.length} submission IDs (batch: ${batchIds.length}, set: ${setIds.length})`);
    
    // Fetch all submissions
    const submissionResults = await Promise.all(submissionIds.map(id => getSubmission(id)));
    const submissions = submissionResults.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getSubmission>>>[];
    
    console.log(`[Status] Returning ${submissions.length} submissions`);
    
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
    
    // ============================================
    // UPLOAD TRACKING: Clear expectedUploadCount when all files are uploaded
    // OR when batch is already completed (don't show upload progress for finished batches)
    // ============================================
    const uploadsComplete = (batch.expectedUploadCount !== undefined && 
                            batch.expectedUploadCount > 0 && 
                            submissions.length >= batch.expectedUploadCount) ||
                           (batchStatus === 'completed');
    
    if (batch.totalSubmissions !== submissions.length || 
        batch.processedCount !== processedCount || 
        batch.failedCount !== failedCount ||
        batch.status !== batchStatus ||
        uploadsComplete) {
      console.log(`[Status] Syncing batch stats: total ${batch.totalSubmissions}->${submissions.length}, processed ${batch.processedCount}->${processedCount}, status ${batch.status}->${batchStatus}, uploadsComplete=${uploadsComplete}`);
      batch = await updateBatch(batchId, {
        totalSubmissions: submissions.length,
        processedCount,
        failedCount,
        status: batchStatus,
        // Clear expected count once all files are uploaded
        ...(uploadsComplete ? { expectedUploadCount: undefined } : {}),
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

