import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, createSession, addTranscriptSegment, broadcastToSession } from '@/lib/session-store';
import { broadcastTranscript } from '@/lib/pusher';
import type { TranscriptSegment } from '@/lib/types';
import { createClient } from '@deepgram/sdk';

// Initialize Deepgram client lazily
let deepgramClient: ReturnType<typeof createClient> | null = null;

function getDeepgram() {
  if (!deepgramClient) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is not set');
    }
    deepgramClient = createClient(apiKey);
  }
  return deepgramClient;
}

function isDeepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

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
    let session = getSession(sessionId);
    if (!session) {
      console.log(`[Transcribe] Session ${sessionId} not found, creating temporary session`);
      session = createSession();
    }

    // Check if Deepgram is configured
    if (!isDeepgramConfigured()) {
      console.log('[Transcribe] DEEPGRAM_API_KEY not found in environment');
      const mockSegment: TranscriptSegment = {
        id: uuidv4(),
        text: '[Deepgram API not configured] Add DEEPGRAM_API_KEY to Vercel environment variables and redeploy.',
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
        error: 'Deepgram API not configured',
        segment: mockSegment,
      });
    }

    // Log original audio info
    const originalMimeType = audioBlob.type || 'audio/webm';
    console.log(`[Transcribe] Received audio: ${audioBlob.size} bytes, mimeType: ${originalMimeType}`);

    // Check minimum size
    if (audioBlob.size < 5000) {
      console.log(`[Transcribe] Audio too small (${audioBlob.size} bytes), skipping`);
      return NextResponse.json({
        success: true,
        message: 'Audio chunk too small, skipping'
      });
    }

    // Convert blob to buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[Transcribe] Sending ${buffer.length} bytes to Deepgram...`);

    // Send to Deepgram - it handles any audio format!
    const deepgram = getDeepgram();
    
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
      }
    );

    if (error) {
      console.error('[Transcribe] Deepgram error:', error);
      throw new Error(`Deepgram error: ${error.message}`);
    }

    // Extract transcript text
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const text = transcript.trim();
    
    console.log(`[Transcribe] Deepgram result: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

    if (!text || text.length === 0) {
      console.log('[Transcribe] No speech detected');
      return NextResponse.json({
        success: true,
        message: 'No speech detected',
      });
    }

    // Create transcript segment
    const segment: TranscriptSegment = {
      id: uuidv4(),
      text,
      timestamp: parseInt(timestamp || '0', 10),
      duration: 0,
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

    // Broadcast via Pusher for real-time multi-user support
    await broadcastTranscript(sessionId, segment);

    return NextResponse.json({
      success: true,
      segment,
    });

  } catch (error) {
    console.error('[Transcribe] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
