import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, getFullTranscript, addQuestion, broadcastToSession } from '@/lib/session-store';
import { generateQuestionsFromTranscript, isOpenAIConfigured } from '@/lib/openai-questions';
import { generateQuestionsWithClaude, generateBranchQuestions, isClaudeConfigured } from '@/lib/claude';
import { broadcastQuestions } from '@/lib/pusher';
import { getCourseDocuments } from '@/lib/context-store';
import { 
  isWebSearchConfigured, 
  searchCurrentEvents, 
  extractSearchTopics, 
  formatSearchContext 
} from '@/lib/web-search';
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
    const { sessionId, context, settings, branchFrom, courseId } = body;

    console.log('[generate-questions] Session:', sessionId, 'Has context:', !!context, 'Has settings:', !!settings);
    if (settings?.maxQuestions) {
      console.log('[generate-questions] Requested question count:', settings.maxQuestions);
    }
    if (settings?.targetCategories?.length) {
      console.log('[generate-questions] Targeted categories:', settings.targetCategories);
    }
    if (settings?.priorities) {
      console.log('[generate-questions] Category priorities:', settings.priorities);
    }
    if (branchFrom) {
      console.log('[generate-questions] Branching from question:', branchFrom.question?.substring(0, 50));
    }

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

    // Fetch course materials if courseId provided
    let courseMaterials: Array<{ id: string; name: string; type: string; rawText: string }> = [];
    if (courseId) {
      try {
        const docs = await getCourseDocuments(courseId);
        courseMaterials = docs.map((d: { id: string; name: string; type: string; rawText: string }) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          rawText: d.rawText.substring(0, 2000), // Limit to first 2000 chars
        }));
        console.log('[generate-questions] Loaded', courseMaterials.length, 'course materials');
      } catch (e) {
        console.log('[generate-questions] Could not load course materials:', e);
      }
    }

    // Extract slide content if provided
    const slideContent = context?.slideContent;
    if (slideContent) {
      console.log('[generate-questions] Slide content provided:', slideContent.keyPoints?.length || 0, 'key points');
    }

    // Search for current events/news to make questions more relevant
    let currentEventsContext = '';
    if (isWebSearchConfigured()) {
      try {
        console.log('[generate-questions] Searching for current events...');
        const searchTopics = extractSearchTopics(transcript);
        
        if (searchTopics.length > 0) {
          console.log('[generate-questions] Search topics:', searchTopics);
          // Search for the first relevant topic
          const searchResults = await searchCurrentEvents(searchTopics[0], 3);
          
          if (searchResults.length > 0) {
            currentEventsContext = formatSearchContext(searchResults);
            console.log('[generate-questions] Found', searchResults.length, 'current events');
          }
        }
      } catch (searchError) {
        console.error('[generate-questions] Web search failed:', searchError);
        // Continue without search results
      }
    } else {
      console.log('[generate-questions] Web search not configured (set TAVILY_API_KEY or SERPER_API_KEY for current events)');
    }

    let questions: GeneratedQuestion[];

    // Handle branching from an existing question
    if (branchFrom && isClaudeConfigured()) {
      console.log('[generate-questions] Branching mode - generating similar questions...');
      if (branchFrom.customization) {
        console.log('[generate-questions] With customization:', branchFrom.customization);
      }
      questions = await generateBranchQuestions(
        branchFrom.question,
        branchFrom.category,
        transcript,
        settings?.maxQuestions || 2,
        courseMaterials,
        branchFrom.customization // Pass user's customization hint
      );
      console.log('[generate-questions] Branch generated', questions.length, 'questions');
    }
    // Prefer Babblet AI, fall back to alternatives, then mock
    else if (isClaudeConfigured()) {
      console.log('[generate-questions] Calling Babblet AI for question generation...');
      // Add course materials and current events to settings
      const enhancedSettings = {
        ...settings,
        courseMaterials,
        currentEventsContext, // Include real-time news context for relevant questions
      };
      questions = await generateQuestionsWithClaude(transcript, analysisContext, slideContent, enhancedSettings);
      console.log('[generate-questions] Babblet AI returned', questions.length, 'questions');
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

