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
    
    // Support both query param and JSON body for count
    let count: number;
    const queryCount = searchParams.get('count');
    if (queryCount !== null) {
      count = parseInt(queryCount, 10);
    } else {
      const body = await request.json().catch(() => ({}));
      count = body.expectedUploadCount ?? 0;
    }

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const currentCount = batch.expectedUploadCount || 0;
    
    // Allow setting to 0 (cancel) or increasing (add more files)
    // Only block decreasing to non-zero values
    if (count === 0 || count > currentCount) {
      const newCount = count === 0 ? undefined : count;
      await updateBatch(batchId, { expectedUploadCount: newCount });
      console.log(`[UpdateExpected] Updated batch ${batchId} expectedUploadCount: ${currentCount} -> ${count === 0 ? 'cleared' : count}`);
      return NextResponse.json({ success: true, expectedUploadCount: newCount ?? 0 });
    }

    return NextResponse.json({ success: true, expectedUploadCount: currentCount });
  } catch (error) {
    console.error('[UpdateExpected] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update expected count' },
      { status: 500 }
    );
  }
}
