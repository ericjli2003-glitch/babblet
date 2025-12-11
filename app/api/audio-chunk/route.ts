import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getSession,
  addTranscriptSegment,
  addSemanticEvent,
  addQuestions,
  getFullTranscript,
  getSemanticEvents,
  getQuestions,
  updateSessionStatus,
} from '@/lib/session-store';
import { processAudioChunk, isGeminiConfigured } from '@/lib/gemini';
import { generateQuestionsFromEvent, isOpenAIConfigured } from '@/lib/openai-questions';

// POST /api/audio-chunk - Receive and process audio chunks
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob | null;
    const sessionId = formData.get('sessionId') as string | null;
    const timestamp = formData.get('timestamp') as string | null;
    const mimeType = formData.get('mimeType') as string || 'audio/webm';

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

    // Update session status if needed
    if (session.status === 'idle') {
      updateSessionStatus(sessionId, 'listening');
    }

    // Check API configurations
    if (!isGeminiConfigured()) {
      // Return mock data if Gemini not configured
      const mockSegment = {
        id: uuidv4(),
        text: '[Gemini API not configured] Add GEMINI_API_KEY to environment variables.',
        timestamp: parseInt(timestamp || '0', 10),
        duration: 0,
        isFinal: true,
      };
      addTranscriptSegment(sessionId, mockSegment);
      return NextResponse.json({ 
        success: false, 
        error: 'Gemini API not configured',
        transcript: mockSegment,
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

    // Process with Gemini
    const previousTranscript = getFullTranscript(sessionId);
    const { transcript, events } = await processAudioChunk(
      buffer,
      mimeType,
      previousTranscript
    );

    // Store transcript
    if (transcript) {
      transcript.timestamp = parseInt(timestamp || '0', 10);
      addTranscriptSegment(sessionId, transcript);
    }

    // Store semantic events and generate questions
    const generatedQuestions = [];
    
    for (const event of events) {
      addSemanticEvent(sessionId, event);
      
      // Generate questions for each semantic event
      if (isOpenAIConfigured()) {
        try {
          const questions = await generateQuestionsFromEvent(event, {
            recentTranscript: getFullTranscript(sessionId),
            previousEvents: getSemanticEvents(sessionId),
            previousQuestions: getQuestions(sessionId),
          });
          
          if (questions.length > 0) {
            addQuestions(sessionId, questions);
            generatedQuestions.push(...questions);
          }
        } catch (e) {
          console.error('Question generation failed:', e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      transcript,
      events,
      questions: generatedQuestions,
    });
  } catch (error) {
    console.error('Audio chunk processing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process audio chunk',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

