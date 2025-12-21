export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSubmission, getBatch } from '@/lib/batch-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, submissionId, fileKey, originalFilename, fileSize, mimeType, studentName } = body;

    if (!batchId || !fileKey || !originalFilename) {
      return NextResponse.json(
        { error: 'batchId, fileKey, and originalFilename are required' },
        { status: 400 }
      );
    }

    // Verify batch exists
    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Create submission (this also queues it for processing)
    const submission = await createSubmission({
      batchId,
      originalFilename,
      fileKey,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'video/mp4',
      studentName,
    });

    // Override ID if client provided one (from presign)
    // Note: in production you might want to validate this matches

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

