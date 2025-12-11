import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, createSession, addTranscriptSegment, broadcastToSession } from '@/lib/session-store';
import { transcribeAudio, isGeminiConfigured } from '@/lib/gemini';
import type { TranscriptSegment } from '@/lib/types';

// Track sessions that have been auto-created on this instance
const autoCreatedSessions = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob | null;
    const sessionId = formData.get('sessionId') as string | null;
    const timestamp = formData.get('timestamp') as string | null;

    if (!audioBlob || !sessionId) {
      return NextResponse.json(
        { error: 'Audio blob and session ID required' },
        { status: 400 }
      );
    }

    // On serverless, sessions may not persist across function invocations
    // Auto-create session if it doesn't exist
    let session = getSession(sessionId);
    if (!session) {
      console.log(`[Transcribe] Session ${sessionId} not found, creating temporary session`);
      session = createSession();
      // Note: This is a workaround for serverless - ideally use a database
    }

    // Check if Gemini is configured
    if (!isGeminiConfigured()) {
      console.log('[Transcribe] GEMINI_API_KEY not found in environment');
      // Return mock transcript if not configured
      const mockSegment: TranscriptSegment = {
        id: uuidv4(),
        text: '[Gemini API not configured] Add GEMINI_API_KEY to Vercel environment variables and redeploy.',
        timestamp: parseInt(timestamp || '0', 10),
        duration: 0,
        isFinal: true,
      };
      
      addTranscriptSegment(sessionId, mockSegment);
      
      broadcastToSession(sessionId, {
        type: 'transcript_update',
        data: { segment: mockSegment },
        timestamp: Date.now(),
        sessionId,
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'Gemini API not configured - add GEMINI_API_KEY to Vercel environment variables',
        segment: mockSegment,
      });
    }

    console.log(`[Transcribe] Processing audio chunk, size: ${audioBlob.size} bytes`);

    // Convert blob to buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check minimum size
    if (buffer.length < 1000) {
      return NextResponse.json({ 
        success: true, 
        message: 'Audio chunk too small, skipping' 
      });
    }

    // Transcribe with Gemini
    const transcriptResult = await transcribeAudio(buffer, 'audio/webm');

    if (transcriptResult && transcriptResult.text) {
      const segment: TranscriptSegment = {
        id: transcriptResult.id,
        text: transcriptResult.text,
        timestamp: parseInt(timestamp || '0', 10),
        duration: transcriptResult.duration || 0,
        isFinal: true,
      };

      addTranscriptSegment(sessionId, segment);

      // Broadcast to connected clients
      broadcastToSession(sessionId, {
        type: 'transcript_update',
        data: { segment },
        timestamp: Date.now(),
        sessionId,
      });

      return NextResponse.json({
        success: true,
        segment,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'No speech detected',
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to transcribe audio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

