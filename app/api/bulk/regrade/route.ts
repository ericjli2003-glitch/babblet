export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { 
  getSubmission, 
  updateSubmission, 
  updateBatchStats,
  getBatch,
  requeue,
} from '@/lib/batch-store';
import { getBundleVersions, getBundleVersion } from '@/lib/context-store';

// POST /api/bulk/regrade - Re-grade submission(s), optionally with a different bundle version
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, submissionId, submissionIds, bundleVersionId } = body;

    // If bundleVersionId provided, validate it exists
    let bundleVersion = null;
    if (bundleVersionId) {
      bundleVersion = await getBundleVersion(bundleVersionId);
      if (!bundleVersion) {
        return NextResponse.json({ error: 'Bundle version not found' }, { status: 404 });
      }
    }

    // Handle single or multiple submissions
    let idsToRegrade = submissionIds || (submissionId ? [submissionId] : []);

    // If batchId provided but no specific IDs, re-grade all submissions in batch
    if (batchId && idsToRegrade.length === 0) {
      const batch = await getBatch(batchId);
      if (batch?.submissionIds) {
        idsToRegrade = batch.submissionIds;
      }
    }

    if (idsToRegrade.length === 0) {
      return NextResponse.json({ error: 'batchId, submissionId, or submissionIds required' }, { status: 400 });
    }

    const results: Array<{ submissionId: string; success: boolean; error?: string }> = [];

    for (const id of idsToRegrade) {
      const submission = await getSubmission(id);
      if (!submission) {
        results.push({ submissionId: id, success: false, error: 'Not found' });
        continue;
      }

      // Reset submission to queued state, optionally with new bundle version
      const updateData: Record<string, unknown> = {
        status: 'queued',
        // Clear previous results
        analysis: undefined,
        rubricEvaluation: undefined,
        questions: undefined,
        verificationFindings: undefined,
        contextCitations: undefined,
        errorMessage: undefined,
        startedAt: undefined,
        completedAt: undefined,
      };
      
      if (bundleVersionId) {
        updateData.bundleVersionId = bundleVersionId;
      }

      await updateSubmission(id, updateData);

      // Re-add to queue
      await requeue(id);

      // Update batch stats
      await updateBatchStats(submission.batchId);

      results.push({ submissionId: id, success: true });
    }

    const successCount = results.filter(r => r.success).length;

    const message = bundleVersion 
      ? `${successCount} submission(s) queued for re-grading with context v${bundleVersion.version}`
      : `${successCount} submission(s) queued for re-grading`;

    console.log(`[Regrade] ${message}`);

    return NextResponse.json({
      success: true,
      message,
      results,
    });
  } catch (error) {
    console.error('[Regrade] Error:', error);
    return NextResponse.json(
      { error: 'Failed to queue re-grade', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// GET /api/bulk/regrade?bundleId=xxx - Get available versions for re-grading
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bundleId = searchParams.get('bundleId');

    if (!bundleId) {
      return NextResponse.json({ error: 'bundleId required' }, { status: 400 });
    }

    const versions = await getBundleVersions(bundleId);

    return NextResponse.json({
      success: true,
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        createdAt: v.createdAt,
        rubricName: v.snapshot.rubric.name,
        criteriaCount: v.snapshot.rubric.criteria.length,
      })),
    });
  } catch (error) {
    console.error('[Regrade] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch versions', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

