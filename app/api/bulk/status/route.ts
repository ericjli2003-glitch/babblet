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
    // SUBMISSION VISIBILITY: Set membership is the source of truth
    // Pull submission IDs directly from the KV set for consistency
    // No scan-based recovery during normal polling to avoid fluctuations
    // ============================================
    const submissionIds = await kv.smembers(`batch_submissions:${batchId}`) as string[];
    console.log(`[Status] BatchId=${batchId} Found ${submissionIds.length} submission IDs in set`);
    
    // Fetch all submissions from the set
    const submissionResults = await Promise.all(submissionIds.map(id => getSubmission(id)));
    let submissions = submissionResults.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getSubmission>>>[];
    
    // Only do recovery if we have ZERO submissions (initial load case)
    // This prevents fluctuating counts during normal polling
    if (submissions.length === 0 && batch.expectedUploadCount && batch.expectedUploadCount > 0) {
      console.log(`[Status] No submissions found but expecting ${batch.expectedUploadCount}, checking queue...`);
      
      const existingIds = new Set<string>();
      
      // Only check the processing queue - no expensive scans
      const queueItems = await kv.lrange('submission_queue', 0, -1) as string[];
      
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
    }
    
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
    // This ensures the UI stops showing upload progress once complete
    // ============================================
    const uploadsComplete = batch.expectedUploadCount !== undefined && 
                           batch.expectedUploadCount > 0 && 
                           submissions.length >= batch.expectedUploadCount;
    
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

