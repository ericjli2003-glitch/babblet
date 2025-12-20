import { NextRequest, NextResponse } from 'next/server';
import { getAllBatches, getBatch, deleteBatch } from '@/lib/batch-store';

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

    await deleteBatch(batchId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DeleteBatch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

