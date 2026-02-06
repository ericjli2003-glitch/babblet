export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes - max for Vercel Pro (OCR can be slow)

import { NextRequest, NextResponse } from 'next/server';
import { createDocument, checkDocumentDuplicate } from '@/lib/context-store';
import { storeDocumentChunks, isEmbeddingsConfigured } from '@/lib/embeddings';
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from '@/lib/text-extraction';
import { uploadFile, downloadFile, getPresignedUploadUrl, isR2Configured } from '@/lib/r2';
import { classifyDocumentType, isClaudeConfigured } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shared processing logic for a document (from buffer)
 */
async function processDocument(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  courseId: string,
  assignmentId: string | undefined,
  documentType: string,
  existingFileKey?: string,
) {
  // Extract text
  const extraction = await extractText(buffer, fileName, fileType);

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

  console.log(`[UploadDocument] Extracted ${extraction.wordCount} words from ${fileName}`);

  // AI-powered document type classification
  let finalDocumentType = documentType;
  let classification = null;
  
  if (documentType === 'auto' || documentType === 'other') {
    try {
      classification = await classifyDocumentType(fileName, extraction.text);
      finalDocumentType = classification.type;
      console.log(`[UploadDocument] AI classified as: ${classification.type} (${classification.confidence}) - ${classification.reasoning}`);
    } catch (classifyError) {
      console.error('[UploadDocument] AI classification failed, using provided type:', classifyError);
    }
  }

  // Store original file in R2 if not already there
  let fileKey = existingFileKey;
  if (!fileKey && isR2Configured()) {
    try {
      fileKey = `documents/${courseId}/${uuidv4()}-${fileName}`;
      await uploadFile(fileKey, buffer, fileType);
      console.log(`[UploadDocument] Stored original in R2: ${fileKey}`);
    } catch (r2Error) {
      console.error('[UploadDocument] R2 upload failed, continuing without:', r2Error);
    }
  }

  // Create document record
  const document = await createDocument({
    courseId,
    assignmentId,
    name: fileName,
    type: finalDocumentType as 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'recording' | 'other',
    rawText: extraction.text,
    fileKey,
    fileSize: buffer.length,
  });

  console.log(`[UploadDocument] Created document ${document.id} with type: ${finalDocumentType}`);

  // Generate embeddings
  let chunkCount = 0;
  if (isEmbeddingsConfigured()) {
    try {
      const chunks = await storeDocumentChunks(
        document.id,
        document.name,
        document.type,
        courseId,
        assignmentId,
        extraction.text
      );
      chunkCount = chunks.length;
      console.log(`[UploadDocument] Generated ${chunkCount} chunks with embeddings`);
    } catch (embError) {
      console.error('[UploadDocument] Embedding generation failed:', embError);
    }
  }

  return NextResponse.json({
    success: true,
    document: {
      id: document.id,
      courseId,
      name: document.name,
      type: document.type,
      fileSize: buffer.length,
      createdAt: document.createdAt,
      indexed: true,
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      fileType: extraction.fileType,
    },
    chunkCount,
    embeddingsEnabled: isEmbeddingsConfigured(),
    aiClassification: classification ? {
      detected: true,
      type: classification.type,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      keyTopics: classification.keyTopics,
    } : null,
  });
}

// POST /api/context/upload-document - Upload and process a document
// Supports two modes:
//   1. FormData with 'file' field (original, limited by Vercel's 4.5MB payload)
//   2. JSON with 'fileKey' + 'fileName' (file already uploaded to R2 via presigned URL)
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // ── Mode 2: Process file already in R2 (JSON body, no size limit) ──
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { fileKey, fileName, courseId, assignmentId, type: documentType = 'other' } = body;

      if (!fileKey || !fileName || !courseId) {
        return NextResponse.json(
          { error: 'fileKey, fileName, and courseId are required' },
          { status: 400 }
        );
      }

      if (!isSupportedFile(fileName)) {
        return NextResponse.json({
          error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        }, { status: 400 });
      }

      // Check for duplicate
      const duplicateCheck = await checkDocumentDuplicate(courseId, fileName, assignmentId || undefined);
      if (duplicateCheck.exists) {
        return NextResponse.json({
          duplicate: true,
          error: 'A document with this name already exists in this course',
          existingDocument: {
            id: duplicateCheck.existingDoc?.id,
            name: duplicateCheck.existingDoc?.name,
          },
        }, { status: 409 });
      }

      console.log(`[UploadDocument] Processing from R2: ${fileKey}`);

      // Download file from R2
      const { buffer, contentType: fileContentType } = await downloadFile(fileKey);
      console.log(`[UploadDocument] Downloaded ${buffer.length} bytes from R2`);

      return processDocument(
        buffer, fileName, fileContentType, courseId,
        assignmentId || undefined, documentType, fileKey,
      );
    }

    // ── Mode 1: Direct file upload via FormData (original flow) ──
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const courseId = formData.get('courseId') as string;
    const assignmentId = formData.get('assignmentId') as string | null;
    const documentType = formData.get('type') as string || 'other';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    if (!isSupportedFile(file.name)) {
      return NextResponse.json({
        error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      }, { status: 400 });
    }

    // Check for duplicate document
    const duplicateCheck = await checkDocumentDuplicate(courseId, file.name, assignmentId || undefined);
    if (duplicateCheck.exists) {
      console.log(`[UploadDocument] Duplicate detected: ${file.name} (existing: ${duplicateCheck.existingDoc?.id})`);
      return NextResponse.json({
        duplicate: true,
        error: 'A document with this name already exists in this course',
        existingDocument: {
          id: duplicateCheck.existingDoc?.id,
          name: duplicateCheck.existingDoc?.name,
        },
      }, { status: 409 });
    }

    console.log(`[UploadDocument] Processing ${file.name} (${file.size} bytes)`);

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return processDocument(
      buffer, file.name, file.type, courseId,
      assignmentId || undefined, documentType,
    );
  } catch (error) {
    console.error('[UploadDocument] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process document', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// GET /api/context/upload-document - Get presigned URL for direct upload
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

