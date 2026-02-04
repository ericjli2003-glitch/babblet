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

    // Verify batch exists with retry (handles eventual consistency)
    let batch = await getBatch(batchId);
    if (!batch) {
      console.log(`[Enqueue] Batch not found on first try, retrying in 500ms...`);
      await new Promise(r => setTimeout(r, 500));
      batch = await getBatch(batchId);
    }
    if (!batch) {
      console.log(`[Enqueue] Batch not found on second try, retrying in 1000ms...`);
      await new Promise(r => setTimeout(r, 1000));
      batch = await getBatch(batchId);
    }
    if (!batch) {
      console.error(`[Enqueue] Batch not found after retries: ${batchId}`);
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    console.log(`[Enqueue] Found batch: ${batch.name}`);

    // Create submission (this also queues it for processing)
    // Use the submissionId from presign if provided for consistency
    const submission = await createSubmission({
      batchId,
      originalFilename,
      fileKey,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'video/mp4',
      studentName,
      submissionId, // Pass the presign-generated ID
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

