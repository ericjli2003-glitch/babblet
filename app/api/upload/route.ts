import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionStatus } from '@/lib/session-store';
import { broadcastToSession } from '../stream-presentation/route';

// POST - Upload video and slides
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const slidesFile = formData.get('slides') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Update status
    updateSessionStatus(sessionId, 'processing');

    // In production, you would:
    // 1. Save files to cloud storage (S3, GCS, etc.)
    // 2. Process video to extract audio
    // 3. Transcribe audio in chunks
    // 4. Process slides through vision API
    
    // For MVP, we'll simulate processing
    const processingResults = {
      videoReceived: !!videoFile,
      videoSize: videoFile?.size,
      videoName: videoFile?.name,
      slidesReceived: !!slidesFile,
      slidesSize: slidesFile?.size,
      slidesName: slidesFile?.name,
    };

    // Broadcast upload received
    broadcastToSession(sessionId, {
      type: 'transcript_update',
      data: {
        segment: {
          id: 'upload-notice',
          text: `[Video "${videoFile?.name || 'unknown'}" received - processing will begin shortly]`,
          timestamp: 0,
          duration: 0,
        },
        fullTranscript: '',
      },
      timestamp: Date.now(),
    });

    // If slides were uploaded, trigger slide analysis
    if (slidesFile) {
      // In production, convert to images and send to vision API
      // For now, just acknowledge receipt
      broadcastToSession(sessionId, {
        type: 'transcript_update',
        data: {
          segment: {
            id: 'slides-notice',
            text: `[Slides "${slidesFile.name}" received - analyzing content]`,
            timestamp: 0,
            duration: 0,
          },
          fullTranscript: '',
        },
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Files received successfully',
      ...processingResults,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}

// GET - Check upload status
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: session.status,
    hasVideo: !!session.metadata.videoUrl,
    hasSlides: !!session.metadata.slidesUrl,
  });
}

