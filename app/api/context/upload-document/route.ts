export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes - max for Vercel Pro (OCR can be slow)

import { NextRequest, NextResponse } from 'next/server';
import { createDocument, checkDocumentDuplicate } from '@/lib/context-store';
import { storeDocumentChunks, isEmbeddingsConfigured } from '@/lib/embeddings';
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from '@/lib/text-extraction';
import { uploadFile, downloadFile, getPresignedUploadUrl, isR2Configured } from '@/lib/r2';
import { classifyDocumentType } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';

// ── Fast filename-based document type detection (no API call) ──
function detectDocumentType(filename: string): string {
  const lowerName = filename.toLowerCase();
  const ext = lowerName.split('.').pop() || '';

  // Extension-based detection
  if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'mp3', 'wav', 'm4a'].includes(ext)) return 'recording';
  if (['pptx', 'ppt', 'key', 'odp'].includes(ext)) return 'slides';

  // Keyword-based detection
  const patterns: { type: string; keywords: string[] }[] = [
    { type: 'slides', keywords: ['slide', 'presentation', 'deck', 'powerpoint'] },
    { type: 'lecture_notes', keywords: ['lecture', 'notes', 'class notes', 'lesson', 'session', 'week'] },
    { type: 'reading', keywords: ['reading', 'article', 'paper', 'chapter', 'textbook', 'journal'] },
    { type: 'policy', keywords: ['syllabus', 'policy', 'guidelines', 'requirements', 'grading', 'rubric'] },
    { type: 'example', keywords: ['example', 'sample', 'template', 'model', 'demo', 'exemplar'] },
    { type: 'recording', keywords: ['recording', 'video', 'audio', 'zoom', 'meet'] },
  ];

  for (const p of patterns) {
    if (p.keywords.some(k => lowerName.includes(k))) return p.type;
  }

  return 'other';
}

/**
 * Shared processing logic for a document (from buffer).
 * - Uses Haiku for fast AI classification (in parallel with R2 upload)
 * - Defers embeddings to background (fire-and-forget)
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
  // Step 1: Extract text (required, can't skip)
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

  // Step 2: Run AI classification + R2 upload IN PARALLEL
  const needsClassification = documentType === 'auto' || documentType === 'other';
  const needsR2Upload = !existingFileKey && isR2Configured();
  let fileKey = existingFileKey;
  const newFileKey = needsR2Upload ? `documents/${courseId}/${uuidv4()}-${fileName}` : undefined;

  // Build parallel tasks
  const parallelTasks: Promise<any>[] = [];

  // Task A: AI classification via Haiku (fast model, truncated input)
  if (needsClassification) {
    parallelTasks.push(
      classifyDocumentType(fileName, extraction.text)
        .catch(err => {
          console.error('[UploadDocument] AI classification failed, using filename fallback:', err);
          return { type: detectDocumentType(fileName), confidence: 'low', reasoning: 'Filename-based fallback' };
        })
    );
  } else {
    parallelTasks.push(Promise.resolve(null));
  }

  // Task B: R2 upload
  if (needsR2Upload && newFileKey) {
    parallelTasks.push(
      uploadFile(newFileKey, buffer, fileType)
        .then(() => { console.log(`[UploadDocument] Stored in R2: ${newFileKey}`); return true; })
        .catch(err => { console.error('[UploadDocument] R2 upload failed:', err); return false; })
    );
  } else {
    parallelTasks.push(Promise.resolve(null));
  }

  // Wait for both — we pay for max(classification, r2) not the sum
  const [classificationResult, r2Result] = await Promise.all(parallelTasks);

  // Resolve final document type
  let finalDocumentType = documentType;
  if (needsClassification && classificationResult) {
    finalDocumentType = classificationResult.type;
    console.log(`[UploadDocument] AI classified as: ${classificationResult.type} (${classificationResult.confidence}) - ${classificationResult.reasoning}`);
  }

  // Resolve file key
  if (needsR2Upload && r2Result && newFileKey) {
    fileKey = newFileKey;
  }

  // Step 3: Create document record (fast KV write)
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

  // Step 4: Generate embeddings in background (fire-and-forget)
  if (isEmbeddingsConfigured()) {
    storeDocumentChunks(
      document.id,
      document.name,
      document.type,
      courseId,
      assignmentId,
      extraction.text
    )
      .then(chunks => console.log(`[UploadDocument] Background: generated ${chunks.length} chunks for ${document.id}`))
      .catch(err => console.error('[UploadDocument] Background embedding failed:', err));
  }

  // Return immediately — don't wait for embeddings
  return NextResponse.json({
    success: true,
    document: {
      id: document.id,
      courseId,
      name: document.name,
      type: document.type,
      fileSize: buffer.length,
      createdAt: document.createdAt,
      indexed: isEmbeddingsConfigured(),
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount,
      fileType: extraction.fileType,
    },
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

