export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllBatches, getBatch, deleteBatch, getBatchSubmissions, getSubmission, updateBatchStats } from '@/lib/batch-store';
import { deleteFile, isR2Configured } from '@/lib/r2';
import { kv } from '@vercel/kv';

async function recoverBatchSubmissions(batchId: string) {
  const recovered: string[] = [];

  // Try to recover from queue first
  const queueItems = await kv.lrange('submission_queue', 0, -1);
  for (const subId of queueItems || []) {
    const sub = await getSubmission(subId as string);
    if (sub && sub.batchId === batchId) {
      await kv.sadd(`batch_submissions:${batchId}`, subId);
      recovered.push(subId as string);
    }
  }

  // If still empty, scan for orphaned submissions
  if (recovered.length === 0) {
    let cursor = 0;
    let scanCount = 0;
    const maxScans = 10;

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: [number, string[]] = await kv.scan(cursor, { match: 'submission:*', count: 100 }) as any;
      cursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        const subId = key.replace('submission:', '');
        const sub = await getSubmission(subId);
        if (sub && sub.batchId === batchId) {
          await kv.sadd(`batch_submissions:${batchId}`, subId);
          recovered.push(subId);
        }
      }

      scanCount++;
    } while (cursor !== 0 && scanCount < maxScans);
  }

  return recovered;
}

// GET /api/bulk/batches - List all batches
export async function GET() {
  try {
    const batches = await getAllBatches();
    const hydrated = await Promise.all(
      batches.map(async (batch) => {
        if (batch.totalSubmissions > 0) {
          const submissions = await getBatchSubmissions(batch.id);
          if (submissions.length === 0) {
            console.log(`[Batches] Recovering submissions for batch ${batch.id}...`);
            await recoverBatchSubmissions(batch.id);
            await updateBatchStats(batch.id);
            const refreshed = await getBatch(batch.id);
            return refreshed || batch;
          }
        }
        return batch;
      })
    );

    return NextResponse.json({ success: true, batches: hydrated });
  } catch (error) {
    console.error('[Batches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/bulk/batches?id=xxx - Delete a batch
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');

    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    console.log(`[DeleteBatch] Deleting batch ${batchId}: ${batch.name}`);

    // Get all submissions to delete their R2 files
    const submissions = await getBatchSubmissions(batchId);
    console.log(`[DeleteBatch] Found ${submissions.length} submissions to delete`);

    // Delete files from R2
    if (isR2Configured() && submissions.length > 0) {
      const deletePromises = submissions.map(async (sub) => {
        if (sub.fileKey) {
          try {
            await deleteFile(sub.fileKey);
            console.log(`[DeleteBatch] Deleted R2 file: ${sub.fileKey}`);
          } catch (err) {
            // Log but don't fail - file might already be deleted
            console.warn(`[DeleteBatch] Failed to delete R2 file ${sub.fileKey}:`, err);
          }
        }
      });
      
      await Promise.allSettled(deletePromises);
      console.log(`[DeleteBatch] R2 file cleanup complete`);
    }

    // Delete KV records
    await deleteBatch(batchId);
    console.log(`[DeleteBatch] KV records deleted for batch ${batchId}`);

    return NextResponse.json({ 
      success: true, 
      deletedFiles: submissions.length 
    });
  } catch (error) {
    console.error('[DeleteBatch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

