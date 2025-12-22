export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSubmission, getBatch } from '@/lib/batch-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, submissionId, fileKey, originalFilename, fileSize, mimeType, studentName } = body;

    console.log(`[Enqueue] Request: batchId=${batchId}, file=${originalFilename}, fileKey=${fileKey}`);

    if (!batchId || !fileKey || !originalFilename) {
      console.error('[Enqueue] Missing required fields');
      return NextResponse.json(
        { error: 'batchId, fileKey, and originalFilename are required' },
        { status: 400 }
      );
    }

    // Verify batch exists
    const batch = await getBatch(batchId);
    if (!batch) {
      console.error(`[Enqueue] Batch not found: ${batchId}`);
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    console.log(`[Enqueue] Found batch: ${batch.name}`);

    // Create submission (this also queues it for processing)
    const submission = await createSubmission({
      batchId,
      originalFilename,
      fileKey,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'video/mp4',
      studentName,
    });

    console.log(`[Enqueue] Created submission: id=${submission.id}, studentName=${submission.studentName}`);

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        studentName: submission.studentName,
        status: submission.status,
      },
    });
  } catch (error) {
    console.error('[Enqueue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to enqueue submission', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

