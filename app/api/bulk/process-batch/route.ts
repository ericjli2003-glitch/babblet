export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes - keep processing even if client navigates away

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/bulk/process-batch
 * Body: { batchId: string }
 *
 * Runs on the server and keeps processing the queue for this batch until empty
 * or time limit. Called fire-and-forget from the client so regrading continues
 * when the user navigates away.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const batchId = body.batchId;
    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json({ error: 'batchId required' }, { status: 400 });
    }

    const maxRunMs = (typeof process.env.BULK_PROCESS_BATCH_MS === 'string'
      ? parseInt(process.env.BULK_PROCESS_BATCH_MS, 10)
      : 4 * 60 * 1000) || 4 * 60 * 1000; // 4 minutes default, leave ~1 min buffer
    const start = Date.now();
    let processed = 0;

    const origin =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : request.headers.get('x-forwarded-host')
          ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host')}`
          : new URL(request.url).origin;

    const processNowUrl = `${origin}/api/bulk/process-now?batchId=${encodeURIComponent(batchId)}`;

    while (Date.now() - start < maxRunMs) {
      const res = await fetch(processNowUrl, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      const count = data.processed ?? 0;
      if (count === 0) break;
      processed += count;
    }

    console.log(`[ProcessBatch] batchId=${batchId} finished. processed=${processed} in ${Date.now() - start}ms`);
    return NextResponse.json({ success: true, processed });
  } catch (error) {
    console.error('[ProcessBatch] Error:', error);
    return NextResponse.json(
      { error: 'Process batch failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
