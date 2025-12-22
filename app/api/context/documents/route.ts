export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow time for embedding generation

import { NextRequest, NextResponse } from 'next/server';
import { 
  createDocument, 
  getDocument, 
  getCourseDocuments, 
  getAssignmentDocuments,
  deleteDocument,
  type Document,
} from '@/lib/context-store';
import { 
  storeDocumentChunks, 
  deleteDocumentChunks,
  isEmbeddingsConfigured,
  getDocumentChunks,
} from '@/lib/embeddings';

// GET /api/context/documents?courseId=xxx - List course documents
// GET /api/context/documents?assignmentId=xxx - List assignment documents
// GET /api/context/documents?id=xxx - Get single document with chunks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');
    const courseId = searchParams.get('courseId');
    const assignmentId = searchParams.get('assignmentId');

    if (documentId) {
      const document = await getDocument(documentId);
      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      
      // Also get chunks
      const chunks = await getDocumentChunks(documentId);
      
      return NextResponse.json({ 
        success: true, 
        document,
        chunks,
        chunkCount: chunks.length,
      });
    }

    if (assignmentId) {
      const documents = await getAssignmentDocuments(assignmentId);
      return NextResponse.json({ success: true, documents });
    }

    if (courseId) {
      const documents = await getCourseDocuments(courseId);
      return NextResponse.json({ success: true, documents });
    }

    return NextResponse.json({ error: 'courseId, assignmentId, or id required' }, { status: 400 });
  } catch (error) {
    console.error('[Documents] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/context/documents - Create document and generate embeddings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courseId, assignmentId, name, type, rawText } = body;

    if (!courseId || !name || !rawText) {
      return NextResponse.json(
        { error: 'courseId, name, and rawText are required' },
        { status: 400 }
      );
    }

    const docType = type || 'other';

    // Create document record
    const document = await createDocument({
      courseId,
      assignmentId,
      name,
      type: docType,
      rawText,
    });

    console.log(`[Documents] Created document ${document.id} - ${name}`);

    // Generate embeddings if configured
    let chunkCount = 0;
    if (isEmbeddingsConfigured()) {
      try {
        const chunks = await storeDocumentChunks(
          document.id,
          document.name,
          document.type,
          courseId,
          assignmentId,
          rawText
        );
        chunkCount = chunks.length;
        console.log(`[Documents] Generated ${chunkCount} chunks with embeddings`);
      } catch (embError) {
        console.error('[Documents] Embedding generation failed:', embError);
        // Document is still created, just without embeddings
      }
    } else {
      console.log('[Documents] Embeddings not configured, skipping chunk generation');
    }

    return NextResponse.json({ 
      success: true, 
      document,
      chunkCount,
      embeddingsEnabled: isEmbeddingsConfigured(),
    });
  } catch (error) {
    console.error('[Documents] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create document', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// DELETE /api/context/documents?id=xxx - Delete document and its chunks
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Delete chunks first
    await deleteDocumentChunks(documentId);
    
    // Delete document
    await deleteDocument(documentId);
    
    console.log(`[Documents] Deleted document ${documentId} and its chunks`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Documents] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete document', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

