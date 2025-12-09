import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, addQuestions } from '@/lib/session-store';
import { generateQuestions } from '@/lib/openai';
import { broadcastToSession } from '../stream-presentation/route';
import type { GeneratedQuestion, KeyClaim, LogicalGap } from '@/lib/types';

// POST - Generate questions based on analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, transcript, claims, gaps } = body as {
      sessionId: string;
      transcript: string;
      claims: KeyClaim[];
      gaps: LogicalGap[];
    };

    if (!sessionId || !transcript) {
      return NextResponse.json(
        { error: 'Session ID and transcript required' },
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

    let questions: GeneratedQuestion[];

    try {
      // Call OpenAI for question generation
      questions = await generateQuestions(
        transcript,
        claims || [],
        gaps || [],
        3 // questions per category
      );
    } catch (openaiError) {
      // If OpenAI fails, create mock questions for development
      console.warn('OpenAI question generation failed, using mock data:', openaiError);
      
      const now = Date.now();
      questions = [
        // Clarifying questions
        {
          id: uuidv4(),
          question: 'Can you elaborate on your main thesis and how it relates to the evidence presented?',
          category: 'clarifying',
          difficulty: 'easy',
          rationale: 'Helps ensure the core argument is clearly understood',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'What specific methodology did you use to gather your data?',
          category: 'clarifying',
          difficulty: 'medium',
          rationale: 'Understanding methodology strengthens evaluation of results',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'How do you define the key terms used in your presentation?',
          category: 'clarifying',
          difficulty: 'easy',
          rationale: 'Ensures shared understanding of terminology',
          timestamp: now,
        },
        // Critical thinking questions
        {
          id: uuidv4(),
          question: 'What are the potential limitations or weaknesses of your argument?',
          category: 'critical-thinking',
          difficulty: 'hard',
          rationale: 'Tests ability to critically evaluate own work',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'How would you respond to someone who disagrees with your main conclusion?',
          category: 'critical-thinking',
          difficulty: 'medium',
          rationale: 'Assesses consideration of counterarguments',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'What assumptions underlie your analysis, and how might they be challenged?',
          category: 'critical-thinking',
          difficulty: 'hard',
          rationale: 'Probes deeper understanding of foundational premises',
          timestamp: now,
        },
        // Expansion questions
        {
          id: uuidv4(),
          question: 'How might your findings apply to other contexts or fields?',
          category: 'expansion',
          difficulty: 'medium',
          rationale: 'Encourages broader application of concepts',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'What future research directions does your work suggest?',
          category: 'expansion',
          difficulty: 'medium',
          rationale: 'Tests understanding of larger research landscape',
          timestamp: now,
        },
        {
          id: uuidv4(),
          question: 'How does your work relate to current debates in the field?',
          category: 'expansion',
          difficulty: 'hard',
          rationale: 'Assesses awareness of broader academic discourse',
          timestamp: now,
        },
      ];
    }

    // Store questions
    addQuestions(sessionId, questions);

    // Broadcast to connected clients
    broadcastToSession(sessionId, {
      type: 'question_generated',
      data: { questions, trigger: 'manual' },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error('Question generation error:', error);
    return NextResponse.json(
      { error: 'Question generation failed' },
      { status: 500 }
    );
  }
}

