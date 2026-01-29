export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl, getPresignedDownloadUrl, generateFileKey, isR2Configured } from '@/lib/r2';
import { getBatch } from '@/lib/batch-store';
import { v4 as uuidv4 } from 'uuid';

// GET - Get presigned download URL for a file
export async function GET(request: NextRequest) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'R2 storage not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get('key');
    const action = searchParams.get('action') || 'download';

    if (!fileKey) {
      return NextResponse.json(
        { error: 'key parameter is required' },
        { status: 400 }
      );
    }

    if (action !== 'download') {
      return NextResponse.json(
        { error: 'Only action=download is supported for GET requests' },
        { status: 400 }
      );
    }

    // Get presigned download URL
    const url = await getPresignedDownloadUrl(fileKey);

    return NextResponse.json({
      success: true,
      url,
      fileKey,
    });
  } catch (error) {
    console.error('[Presign GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned download URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Get presigned upload URL
export async function POST(request: NextRequest) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in environment.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { batchId, filename, contentType } = body;

    if (!batchId || !filename || !contentType) {
      return NextResponse.json(
        { error: 'batchId, filename, and contentType are required' },
        { status: 400 }
      );
    }

    // Verify batch exists (with retry for eventual consistency)
    let batch = await getBatch(batchId);
    if (!batch) {
      console.log(`[Presign] Batch not found on first try: ${batchId}, retrying...`);
      await new Promise(r => setTimeout(r, 500));
      batch = await getBatch(batchId);
    }
    if (!batch) {
      console.error(`[Presign] Batch not found: ${batchId}`);
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Validate content type
    const allowedTypes = [
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
      'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/mp3', 'audio/x-wav'
    ];
    
    if (!allowedTypes.some(t => contentType.startsWith(t.split('/')[0]))) {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}. Allowed: video/*, audio/*` },
        { status: 400 }
      );
    }

    // Generate unique submission ID and file key
    const submissionId = uuidv4();
    const fileKey = generateFileKey(batchId, submissionId, filename);

    // Get presigned upload URL
    const uploadUrl = await getPresignedUploadUrl(fileKey, contentType);

    return NextResponse.json({
      success: true,
      uploadUrl,
      fileKey,
      submissionId,
    });
  } catch (error) {
    console.error('[Presign] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

