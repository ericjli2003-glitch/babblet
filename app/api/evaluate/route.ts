import { NextRequest, NextResponse } from 'next/server';
import { getSession, getFullTranscript, setRubric, broadcastToSession } from '@/lib/session-store';
import { generateRubricEvaluation, isOpenAIConfigured } from '@/lib/openai-questions';
import { evaluateWithClaude, isClaudeConfigured } from '@/lib/claude';
import { broadcastRubric } from '@/lib/pusher';
import type { RubricEvaluation } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, transcript: providedTranscript, customRubric } = await request.json();

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
    if (customRubric) {
      console.log(`[Evaluate] Using custom rubric: ${customRubric.slice(0, 100)}...`);
    }

    let rubric: RubricEvaluation;

    // Try Claude first (preferred), then OpenAI, then mock
    if (isClaudeConfigured()) {
      console.log('[Evaluate] Using Claude for rubric evaluation');
      rubric = await evaluateWithClaude(transcript, customRubric, undefined, analysis);
    } else if (isOpenAIConfigured()) {
      console.log('[Evaluate] Using OpenAI for rubric evaluation');
      rubric = await generateRubricEvaluation(transcript, analysis);
    } else {
      // Mock rubric if no API configured
      console.log('[Evaluate] No API configured, using mock rubric');
      rubric = {
        contentQuality: {
          score: 3,
          feedback: 'Configure ANTHROPIC_API_KEY or OPENAI_API_KEY for real evaluation',
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
        overallFeedback: 'Add ANTHROPIC_API_KEY or OPENAI_API_KEY to environment variables for complete rubric evaluation.',
        timestamp: Date.now(),
      };
    }

    setRubric(sessionId, rubric);

    // Broadcast via SSE (legacy)
    broadcastToSession(sessionId, {
      type: 'rubric_update',
      data: { rubric },
      timestamp: Date.now(),
      sessionId,
    });

    // Broadcast via Pusher for real-time multi-user support
    await broadcastRubric(sessionId, rubric);

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate presentation' },
      { status: 500 }
    );
  }
}

