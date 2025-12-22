export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllBatches, getBatch, deleteBatch, getBatchSubmissions } from '@/lib/batch-store';
import { deleteFile, isR2Configured } from '@/lib/r2';

// GET /api/bulk/batches - List all batches
export async function GET() {
  try {
    const batches = await getAllBatches();
    return NextResponse.json({ success: true, batches });
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

