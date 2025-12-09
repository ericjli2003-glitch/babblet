import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { addTranscriptSegment, getSession } from '@/lib/session-store';
import { transcribeAudioChunk } from '@/lib/openai';
import { broadcastToSession } from '../stream-presentation/route';
import type { TranscriptSegment } from '@/lib/types';

// POST - Transcribe audio chunk
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const sessionId = formData.get('sessionId') as string | null;
    const timestamp = formData.get('timestamp') as string | null;

    if (!audioFile || !sessionId) {
      return NextResponse.json(
        { error: 'Audio file and session ID required' },
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

    // Convert Blob to Buffer for OpenAI
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let segment: TranscriptSegment;

    try {
      // Call OpenAI Whisper API for transcription
      const transcriptionResult = await transcribeAudioChunk(buffer);
      
      if (!transcriptionResult) {
        // No speech detected, return empty response
        return NextResponse.json({ success: true, segment: null });
      }

      segment = {
        ...transcriptionResult,
        timestamp: parseInt(timestamp || '0', 10),
      };
    } catch (openaiError) {
      // If OpenAI fails (e.g., no API key), create a mock segment for development
      console.warn('OpenAI transcription failed, using mock data:', openaiError);
      
      segment = {
        id: uuidv4(),
        text: `[Audio chunk received at ${new Date().toLocaleTimeString()}] - Transcription requires OPENAI_API_KEY`,
        timestamp: parseInt(timestamp || '0', 10),
        duration: 5000,
        confidence: 0.5,
      };
    }

    // Store in session
    addTranscriptSegment(sessionId, segment);

    // Broadcast to connected clients
    broadcastToSession(sessionId, {
      type: 'transcript_update',
      data: {
        segment,
        fullTranscript: session.transcript.map(c => c.fullText).join(' '),
      },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, segment });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    );
  }
}

