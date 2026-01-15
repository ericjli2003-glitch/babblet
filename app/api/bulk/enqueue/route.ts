export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSubmission, getBatch } from '@/lib/batch-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, submissionId, fileKey, originalFilename, fileSize, mimeType, studentName } = body;

    console.log(`[Enqueue] Request: batchId=${batchId}, file=${originalFilename}, fileKey=${fileKey}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4d4a084e-4174-46b3-8733-338fa5664bc9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enqueue/route.ts:12',message:'Enqueue request received',data:{batchId,providedSubmissionId:submissionId,fileKey,originalFilename},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4d4a084e-4174-46b3-8733-338fa5664bc9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enqueue/route.ts:42',message:'Submission created - ID MISMATCH CHECK',data:{providedId:submissionId,createdId:submission.id,match:submissionId===submission.id,batchId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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

