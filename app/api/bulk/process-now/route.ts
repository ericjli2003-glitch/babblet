export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getQueueLength } from '@/lib/batch-store';

// POST /api/bulk/process-now - Trigger workers from browser (no auth needed)
// This endpoint can be safely called from the frontend
export async function POST() {
  try {
    const queueLength = await getQueueLength();
    
    if (queueLength === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Queue is empty, nothing to process',
        processed: 0 
      });
    }

    // Determine base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const secret = process.env.CRON_SECRET || '';
    
    // Fan out: trigger multiple workers concurrently for faster processing
    const fanout = Math.min(queueLength, Number(process.env.BULK_WORKER_FANOUT) || 3);

    console.log(`[ProcessNow] Triggering ${fanout} workers for ${queueLength} queued items`);

    // Fire and forget - don't wait for workers to complete
    // This allows the UI to be responsive while processing happens in background
    const workerPromises = Array.from({ length: fanout }).map(() =>
      fetch(`${baseUrl}/api/bulk/worker?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
      }).catch(err => {
        console.error('[ProcessNow] Worker trigger failed:', err);
        return null;
      })
    );

    // Wait just a moment to ensure workers start, but don't block on completion
    await Promise.race([
      Promise.allSettled(workerPromises),
      new Promise(resolve => setTimeout(resolve, 500)),
    ]);

    return NextResponse.json({
      success: true,
      message: `Triggered ${fanout} workers for ${queueLength} queued submissions`,
      queueLength,
      fanout,
    });
  } catch (error) {
    console.error('[ProcessNow] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger processing', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

