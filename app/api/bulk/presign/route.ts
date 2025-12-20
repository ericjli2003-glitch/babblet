import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl, generateFileKey, isR2Configured } from '@/lib/r2';
import { v4 as uuidv4 } from 'uuid';

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

