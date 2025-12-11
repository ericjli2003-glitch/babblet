import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, addTranscriptSegment, broadcastToSession } from '@/lib/session-store';
import { transcribeAudio, isGeminiConfigured } from '@/lib/gemini';
import type { TranscriptSegment } from '@/lib/types';

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

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if Gemini is configured
    if (!isGeminiConfigured()) {
      // Return mock transcript if not configured
      const mockSegment: TranscriptSegment = {
        id: uuidv4(),
        text: '[Gemini API not configured] Add GEMINI_API_KEY to environment variables.',
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
        error: 'Gemini API not configured',
        segment: mockSegment,
      });
    }

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

