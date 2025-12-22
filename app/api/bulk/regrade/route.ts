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

// POST /api/bulk/regrade - Re-grade submission(s) with a different bundle version
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submissionId, submissionIds, bundleVersionId } = body;

    if (!bundleVersionId) {
      return NextResponse.json({ error: 'bundleVersionId is required' }, { status: 400 });
    }

    // Validate bundle version exists
    const bundleVersion = await getBundleVersion(bundleVersionId);
    if (!bundleVersion) {
      return NextResponse.json({ error: 'Bundle version not found' }, { status: 404 });
    }

    // Handle single or multiple submissions
    const idsToRegrade = submissionIds || (submissionId ? [submissionId] : []);

    if (idsToRegrade.length === 0) {
      return NextResponse.json({ error: 'submissionId or submissionIds required' }, { status: 400 });
    }

    const results: Array<{ submissionId: string; success: boolean; error?: string }> = [];

    for (const id of idsToRegrade) {
      const submission = await getSubmission(id);
      if (!submission) {
        results.push({ submissionId: id, success: false, error: 'Not found' });
        continue;
      }

      // Reset submission to queued state with new bundle version
      await updateSubmission(id, {
        bundleVersionId: bundleVersionId,
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
      });

      // Re-add to queue
      await requeue(id);

      // Update batch stats
      await updateBatchStats(submission.batchId);

      results.push({ submissionId: id, success: true });
    }

    const successCount = results.filter(r => r.success).length;

    console.log(`[Regrade] Queued ${successCount}/${idsToRegrade.length} submissions with bundleVersion ${bundleVersion.version}`);

    return NextResponse.json({
      success: true,
      message: `${successCount} submission(s) queued for re-grading with context v${bundleVersion.version}`,
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

