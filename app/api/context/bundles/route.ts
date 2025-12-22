export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  getBundle,
  updateBundle,
  createBundleVersion,
  getBundleVersion,
  getBundleVersions,
  getLatestBundleVersion,
  getOrCreateAssignmentBundle,
  getGradingContext,
} from '@/lib/context-store';

// GET /api/context/bundles?assignmentId=xxx - Get bundle for assignment
// GET /api/context/bundles?bundleId=xxx - Get bundle by ID
// GET /api/context/bundles?versionId=xxx - Get specific bundle version
// GET /api/context/bundles?bundleId=xxx&versions=true - Get all versions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');
    const bundleId = searchParams.get('bundleId');
    const versionId = searchParams.get('versionId');
    const getVersions = searchParams.get('versions') === 'true';

    // Get grading context for a specific version
    if (versionId) {
      const context = await getGradingContext(versionId);
      if (!context) {
        return NextResponse.json({ error: 'Bundle version not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, context });
    }

    // Get bundle by ID
    if (bundleId) {
      const bundle = await getBundle(bundleId);
      if (!bundle) {
        return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
      }

      if (getVersions) {
        const versions = await getBundleVersions(bundleId);
        return NextResponse.json({ success: true, bundle, versions });
      }

      const latestVersion = await getLatestBundleVersion(bundleId);
      return NextResponse.json({ success: true, bundle, latestVersion });
    }

    // Get or create bundle for assignment
    if (assignmentId) {
      const bundle = await getOrCreateAssignmentBundle(assignmentId);
      if (!bundle) {
        return NextResponse.json({ 
          error: 'Cannot create bundle - assignment may be missing rubric' 
        }, { status: 400 });
      }

      const latestVersion = await getLatestBundleVersion(bundle.id);
      return NextResponse.json({ success: true, bundle, latestVersion });
    }

    return NextResponse.json({ error: 'assignmentId, bundleId, or versionId required' }, { status: 400 });
  } catch (error) {
    console.error('[Bundles] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bundle', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/context/bundles/snapshot - Create new bundle version (snapshot)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bundleId, assignmentId } = body;

    let targetBundleId = bundleId;

    // If assignmentId provided, get or create the bundle first
    if (!targetBundleId && assignmentId) {
      const bundle = await getOrCreateAssignmentBundle(assignmentId);
      if (!bundle) {
        return NextResponse.json({ 
          error: 'Cannot create bundle - assignment may be missing rubric' 
        }, { status: 400 });
      }
      targetBundleId = bundle.id;
    }

    if (!targetBundleId) {
      return NextResponse.json({ error: 'bundleId or assignmentId required' }, { status: 400 });
    }

    const version = await createBundleVersion(targetBundleId);
    if (!version) {
      return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
    }

    console.log(`[Bundles] Created snapshot v${version.version} for bundle ${targetBundleId}`);

    return NextResponse.json({ success: true, version });
  } catch (error) {
    console.error('[Bundles] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// PATCH /api/context/bundles - Update bundle (not versions - those are immutable)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { bundleId, ...updates } = body;

    if (!bundleId) {
      return NextResponse.json({ error: 'bundleId is required' }, { status: 400 });
    }

    const bundle = await updateBundle(bundleId, updates);
    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, bundle });
  } catch (error) {
    console.error('[Bundles] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update bundle', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

