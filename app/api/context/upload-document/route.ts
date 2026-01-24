export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes - max for Vercel Pro (OCR can be slow)

import { NextRequest, NextResponse } from 'next/server';
import { createDocument, checkDocumentDuplicate } from '@/lib/context-store';
import { storeDocumentChunks, isEmbeddingsConfigured } from '@/lib/embeddings';
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from '@/lib/text-extraction';
import { uploadFile, getPresignedUploadUrl, isR2Configured } from '@/lib/r2';
import { classifyDocumentType, isClaudeConfigured } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';

// POST /api/context/upload-document - Upload and extract text from a file
export async function POST(request: NextRequest) {
  try {
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

    // Extract text
    const extraction = await extractText(buffer, file.name, file.type);

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

    console.log(`[UploadDocument] Extracted ${extraction.wordCount} words from ${file.name}`);

    // AI-powered document type classification
    let finalDocumentType = documentType;
    let classification = null;
    
    if (documentType === 'auto' || documentType === 'other') {
      try {
        classification = await classifyDocumentType(file.name, extraction.text);
        finalDocumentType = classification.type;
        console.log(`[UploadDocument] AI classified as: ${classification.type} (${classification.confidence}) - ${classification.reasoning}`);
      } catch (classifyError) {
        console.error('[UploadDocument] AI classification failed, using provided type:', classifyError);
      }
    }

    // Optionally store original file in R2
    let fileKey: string | undefined;
    if (isR2Configured()) {
      try {
        fileKey = `documents/${courseId}/${uuidv4()}-${file.name}`;
        await uploadFile(fileKey, buffer, file.type);
        console.log(`[UploadDocument] Stored original in R2: ${fileKey}`);
      } catch (r2Error) {
        console.error('[UploadDocument] R2 upload failed, continuing without:', r2Error);
      }
    }

    // Create document record
    const document = await createDocument({
      courseId,
      assignmentId: assignmentId || undefined,
      name: file.name,
      type: finalDocumentType as 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'recording' | 'other',
      rawText: extraction.text,
      fileKey,
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
          assignmentId || undefined,
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
        name: document.name,
        type: document.type,
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

