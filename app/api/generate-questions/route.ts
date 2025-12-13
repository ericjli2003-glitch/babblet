import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, getFullTranscript, addQuestion, broadcastToSession } from '@/lib/session-store';
import { generateQuestionsFromTranscript, isOpenAIConfigured } from '@/lib/openai-questions';
import { generateQuestionsWithClaude, isClaudeConfigured } from '@/lib/claude';
import { broadcastQuestions } from '@/lib/pusher';
import type { GeneratedQuestion, QuestionCategory, QuestionDifficulty, AnalysisSummary } from '@/lib/types';

// Force dynamic rendering (required for POST handlers on Vercel)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET handler for testing endpoint existence
export async function GET() {
  console.log('[generate-questions] GET request received - endpoint is alive');
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/generate-questions',
    method: 'POST required for question generation'
  });
}

export async function POST(request: NextRequest) {
  console.log('[generate-questions] POST request received');

  try {
    const body = await request.json();
    const { sessionId, context } = body;

    console.log('[generate-questions] Session:', sessionId, 'Has context:', !!context);

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // On Vercel serverless, sessions don't persist across function invocations
    // Use provided context transcript first, fall back to session if available
    const session = getSession(sessionId);
    let transcript = context?.transcript;
    let analysisContext: AnalysisSummary | undefined = undefined;

    if (!transcript && session) {
      transcript = getFullTranscript(sessionId);
      analysisContext = session.analysis;
    }

    // Build analysis context from provided claims/gaps if available
    if (context?.claims || context?.gaps) {
      analysisContext = {
        keyClaims: context.claims || [],
        logicalGaps: context.gaps || [],
        missingEvidence: [],
        overallStrength: 3,
        suggestions: [],
        timestamp: Date.now(),
      };
    }

    if (!transcript || transcript.trim().length === 0) {
      console.log('[generate-questions] No transcript available');
      return NextResponse.json(
        { error: 'No transcript available for question generation' },
        { status: 400 }
      );
    }

    console.log('[generate-questions] Transcript length:', transcript.length, 'chars');
    
    // Extract slide content if provided
    const slideContent = context?.slideContent;
    if (slideContent) {
      console.log('[generate-questions] Slide content provided:', slideContent.keyPoints?.length || 0, 'key points');
    }

    let questions: GeneratedQuestion[];

    // Prefer Claude, fall back to OpenAI, then mock
    if (isClaudeConfigured()) {
      console.log('[generate-questions] Calling Claude Sonnet 4 for question generation...');
      questions = await generateQuestionsWithClaude(transcript, analysisContext, slideContent);
      console.log('[generate-questions] Claude returned', questions.length, 'questions');
    } else if (isOpenAIConfigured()) {
      console.log('[generate-questions] Calling OpenAI for question generation...');
      questions = await generateQuestionsFromTranscript(transcript, analysisContext);
      console.log('[generate-questions] OpenAI returned', questions.length, 'questions');
    } else {
      // Mock questions if no LLM configured
      console.log('[generate-questions] No LLM configured, returning mock questions');

      questions = [
        {
          id: uuidv4(),
          question: 'Add ANTHROPIC_API_KEY or OPENAI_API_KEY to enable real questions',
          category: 'clarifying',
          difficulty: 'easy',
          rationale: 'Configure an LLM API key in Vercel environment variables',
          timestamp: Date.now(),
        },
      ];
    }

    // Add questions to session and broadcast
    questions.forEach(q => {
      addQuestion(sessionId, q);
    });

    // Broadcast via SSE (legacy)
    broadcastToSession(sessionId, {
      type: 'question_generated',
      data: { questions, trigger: 'periodic' },
      timestamp: Date.now(),
      sessionId,
    });

    // Broadcast via Pusher for real-time multi-user support
    await broadcastQuestions(sessionId, questions);

    console.log('[generate-questions] Success, generated', questions.length, 'questions');
    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error('[generate-questions] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate questions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

