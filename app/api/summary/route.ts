import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getFullTranscript,
  getSemanticEvents,
  setSummary,
} from '@/lib/session-store';
import { generateSummary, isOpenAIConfigured } from '@/lib/openai-questions';

// POST - Generate summary for a session
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

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

    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        { error: 'OpenAI API not configured' },
        { status: 500 }
      );
    }

    const transcript = getFullTranscript(sessionId);
    const events = getSemanticEvents(sessionId);

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for summary' },
        { status: 400 }
      );
    }

    const summary = await generateSummary(transcript, events);
    setSummary(sessionId, summary);

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('Summary generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

