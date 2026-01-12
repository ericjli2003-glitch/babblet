export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow time for download + extraction + embeddings

import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from '@/lib/context-store';
import { storeDocumentChunks, isEmbeddingsConfigured } from '@/lib/embeddings';
import { extractTextFromUrl, isSupportedFile, SUPPORTED_EXTENSIONS } from '@/lib/text-extraction';
import { getPresignedUploadUrl, getPresignedDownloadUrl, isR2Configured } from '@/lib/r2';
import { v4 as uuidv4 } from 'uuid';

// GET /api/context/process-r2-document - Get presigned URL for direct upload
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const courseId = searchParams.get('courseId');

  if (!filename || !courseId) {
    return NextResponse.json({ error: 'filename and courseId required' }, { status: 400 });
  }

  if (!isSupportedFile(filename)) {
    return NextResponse.json({
      error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      supportedExtensions: SUPPORTED_EXTENSIONS,
    }, { status: 400 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
  }

  const fileKey = `documents/${courseId}/${uuidv4()}-${filename}`;
  const presignedUrl = await getPresignedUploadUrl(fileKey, 'application/octet-stream');

  return NextResponse.json({
    success: true,
    presignedUrl,
    fileKey,
    supportedExtensions: SUPPORTED_EXTENSIONS,
  });
}

// POST /api/context/process-r2-document - Process a file already uploaded to R2
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileKey, filename, courseId, assignmentId, type } = body;

    if (!fileKey || !filename || !courseId) {
      return NextResponse.json(
        { error: 'fileKey, filename, and courseId are required' },
        { status: 400 }
      );
    }

    if (!isR2Configured()) {
      return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
    }

    console.log(`[ProcessR2Document] Processing ${filename} from ${fileKey}`);

    // Get download URL for the file
    const downloadUrl = await getPresignedDownloadUrl(fileKey);

    // Extract text from the file
    const extraction = await extractTextFromUrl(downloadUrl, filename);

    if (!extraction.success) {
      return NextResponse.json({
        error: `Text extraction failed: ${extraction.error}`,
      }, { status: 400 });
    }

    if (!extraction.text || extraction.text.trim().length < 10) {
      return NextResponse.json({
        error: 'Extracted text is empty or too short',
      }, { status: 400 });
    }

    console.log(`[ProcessR2Document] Extracted ${extraction.wordCount} words from ${filename}`);

    // Create document record
    const document = await createDocument({
      courseId,
      assignmentId: assignmentId || undefined,
      name: filename,
      type: (type as 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'other') || 'other',
      rawText: extraction.text,
      fileKey,
    });

    console.log(`[ProcessR2Document] Created document ${document.id}`);

    // Generate embeddings
    let chunkCount = 0;
    if (isEmbeddingsConfigured()) {
      try {
        const chunks = await storeDocumentChunks(
          document.id,
          document.name,
          document.type,
          courseId,
          assignmentId || undefined,
          extraction.text
        );
        chunkCount = chunks.length;
        console.log(`[ProcessR2Document] Generated ${chunkCount} chunks with embeddings`);
      } catch (embError) {
        console.error('[ProcessR2Document] Embedding generation failed:', embError);
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        wordCount: extraction.wordCount,
        pageCount: extraction.pageCount,
        fileType: extraction.fileType,
      },
      chunkCount,
      embeddingsEnabled: isEmbeddingsConfigured(),
    });
  } catch (error) {
    console.error('[ProcessR2Document] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process document', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
