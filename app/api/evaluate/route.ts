import { NextRequest, NextResponse } from 'next/server';
import { getSession, getFullTranscript, setRubric, broadcastToSession } from '@/lib/session-store';
import { generateRubricEvaluation, isOpenAIConfigured } from '@/lib/openai-questions';
import type { RubricEvaluation } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, transcript: providedTranscript } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Use provided transcript or try to get from session (may not work on serverless)
    let transcript = providedTranscript;
    let analysis = null;
    if (!transcript) {
      const session = getSession(sessionId);
      if (session) {
        transcript = getFullTranscript(sessionId);
        analysis = session.analysis;
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for evaluation' },
        { status: 400 }
      );
    }
    
    console.log(`[Evaluate] Processing transcript: ${transcript.slice(0, 100)}...`);

    let rubric: RubricEvaluation;

    if (isOpenAIConfigured()) {
      rubric = await generateRubricEvaluation(transcript, analysis);
    } else {
      // Mock rubric if OpenAI not configured
      rubric = {
        contentQuality: {
          score: 3,
          feedback: 'Configure OPENAI_API_KEY for real evaluation',
          strengths: ['Content present'],
          improvements: ['Add API key for detailed feedback'],
        },
        delivery: {
          score: 3,
          feedback: 'Unable to evaluate delivery without API key',
          strengths: ['Speaking detected'],
          improvements: ['Configure API for analysis'],
        },
        evidenceStrength: {
          score: 2.5,
          feedback: 'Evidence evaluation requires API configuration',
          strengths: ['Some points made'],
          improvements: ['Add supporting evidence'],
        },
        overallScore: 2.8,
        overallFeedback: 'Add OPENAI_API_KEY to environment variables for complete rubric evaluation.',
        timestamp: Date.now(),
      };
    }

    setRubric(sessionId, rubric);

    broadcastToSession(sessionId, {
      type: 'rubric_update',
      data: { rubric },
      timestamp: Date.now(),
      sessionId,
    });

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate presentation' },
      { status: 500 }
    );
  }
}

