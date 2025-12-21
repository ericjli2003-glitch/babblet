export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getQueueLength } from '@/lib/batch-store';

// How many worker instances to trigger concurrently
const DEFAULT_FANOUT = 3;

// POST /api/bulk/process-now - Trigger workers from browser (no auth needed)
// This endpoint can be safely called from the frontend
export async function POST() {
  try {
    const queueLength = await getQueueLength();
    
    console.log(`[ProcessNow] Queue length: ${queueLength}`);
    
    if (queueLength === 0) {
      console.log('[ProcessNow] Queue is empty, nothing to process');
      return NextResponse.json({ 
        success: true, 
        message: 'Queue is empty, nothing to process',
        processed: 0 
      });
    }

    // Determine base URL for internal API calls
    let baseUrl: string;
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = 'http://localhost:3000';
    }

    const secret = process.env.CRON_SECRET || '';
    const fanout = Math.min(queueLength, Number(process.env.BULK_WORKER_FANOUT) || DEFAULT_FANOUT);

    console.log(`[ProcessNow] Triggering ${fanout} workers at ${baseUrl}, secret=${secret ? 'configured' : 'not-set'}`);

    // Fire workers with proper auth
    const workerUrl = secret 
      ? `${baseUrl}/api/bulk/worker?secret=${encodeURIComponent(secret)}`
      : `${baseUrl}/api/bulk/worker`;

    const workerPromises = Array.from({ length: fanout }).map(async (_, i) => {
      try {
        console.log(`[ProcessNow] Triggering worker ${i + 1}/${fanout}`);
        const response = await fetch(workerUrl, { method: 'POST' });
        const data = await response.json();
        console.log(`[ProcessNow] Worker ${i + 1} response:`, { status: response.status, processed: data.processed });
        return { success: response.ok, data };
      } catch (err) {
        console.error(`[ProcessNow] Worker ${i + 1} failed:`, err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    });

    // Wait for all workers to at least start (with timeout)
    const results = await Promise.race([
      Promise.allSettled(workerPromises),
      new Promise<PromiseSettledResult<{ success: boolean }>[]>(resolve => 
        setTimeout(() => resolve([]), 5000) // 5 second timeout
      ),
    ]);

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`[ProcessNow] Triggered ${successCount}/${fanout} workers successfully`);

    return NextResponse.json({
      success: true,
      message: `Triggered ${fanout} workers for ${queueLength} queued submissions`,
      queueLength,
      fanout,
      workersStarted: successCount,
    });
  } catch (error) {
    console.error('[ProcessNow] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger processing', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/bulk/process-now - Check configuration (for debugging)
export async function GET() {
  try {
    const queueLength = await getQueueLength();
    
    return NextResponse.json({
      success: true,
      queueLength,
      cronSecretConfigured: !!process.env.CRON_SECRET,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'localhost:3000',
      fanout: Number(process.env.BULK_WORKER_FANOUT) || DEFAULT_FANOUT,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
