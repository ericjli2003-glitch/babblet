export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updateBatch, getBatch } from '@/lib/batch-store';

/**
 * Simple endpoint to update expectedUploadCount for a batch.
 * Used when adding more files to persist the new expected count.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const count = parseInt(searchParams.get('count') || '0', 10);

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Only update if new count is higher (don't accidentally decrease)
    const currentCount = batch.expectedUploadCount || 0;
    if (count > currentCount) {
      await updateBatch(batchId, { expectedUploadCount: count });
      console.log(`[UpdateExpected] Updated batch ${batchId} expectedUploadCount: ${currentCount} -> ${count}`);
    }

    return NextResponse.json({ success: true, expectedUploadCount: Math.max(count, currentCount) });
  } catch (error) {
    console.error('[UpdateExpected] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update expected count' },
      { status: 500 }
    );
  }
}
