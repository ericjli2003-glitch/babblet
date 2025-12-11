// ============================================
// OpenAI Question Generation
// Generate insightful questions from semantic events
// ============================================

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  SemanticEvent,
  GeneratedQuestion,
  QuestionType,
} from './types';

// Initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ============================================
// Question Generation System Prompt
// ============================================

const QUESTION_GENERATION_PROMPT = `You are an expert professor skilled at Socratic questioning. 
Your role is to generate insightful questions that help deepen understanding and identify gaps in student presentations.

Based on the semantic event provided, generate 1-3 relevant questions. Consider:

1. **Follow-up Questions**: Probe deeper into the topic
2. **Clarifying Questions**: Address ambiguities or unclear points
3. **Critical Thinking Questions**: Challenge assumptions, explore implications
4. **Misconception Checks**: Verify understanding of key concepts
5. **Expansion Questions**: Connect to broader topics or applications

For each question, provide:
- The question type
- The question itself (clear, concise, thought-provoking)
- Brief rationale (why this question matters)
- Priority (low/medium/high based on pedagogical value)

Respond in JSON format:
{
  "questions": [
    {
      "type": "follow_up" | "clarifying" | "critical_thinking" | "misconception_check" | "expansion",
      "question": "The question text",
      "rationale": "Why this question is valuable",
      "priority": "low" | "medium" | "high"
    }
  ]
}`;

// ============================================
// Generate Questions from Semantic Event
// ============================================

export async function generateQuestionsFromEvent(
  event: SemanticEvent,
  context: {
    recentTranscript: string;
    previousEvents: SemanticEvent[];
    previousQuestions: GeneratedQuestion[];
  }
): Promise<GeneratedQuestion[]> {
  try {
    const client = getOpenAIClient();
    
    // Build context summary
    const previousEventsSummary = context.previousEvents
      .slice(-5)
      .map(e => `- [${e.type}] ${e.content}`)
      .join('\n');
    
    const previousQuestionsSummary = context.previousQuestions
      .slice(-5)
      .map(q => `- ${q.question}`)
      .join('\n');
    
    const userPrompt = `
## Current Semantic Event
Type: ${event.type}
Content: ${event.content}
Confidence: ${event.confidence}

## Recent Transcript Context
${context.recentTranscript.slice(-1000)}

## Previous Events (for context)
${previousEventsSummary || 'None yet'}

## Questions Already Asked (avoid repetition)
${previousQuestionsSummary || 'None yet'}

Generate insightful questions for this event. Avoid repeating similar questions to those already asked.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: QUESTION_GENERATION_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return [];
    }

    return parsed.questions.map((q: {
      type: QuestionType;
      question: string;
      rationale?: string;
      priority: 'low' | 'medium' | 'high';
    }) => ({
      id: uuidv4(),
      type: q.type,
      question: q.question,
      rationale: q.rationale,
      relatedEvent: event.id,
      priority: q.priority,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Question generation error:', error);
    return [];
  }
}

// ============================================
// Generate Summary
// ============================================

export async function generateSummary(
  transcript: string,
  events: SemanticEvent[]
): Promise<string> {
  try {
    const client = getOpenAIClient();
    
    const eventsSummary = events
      .map(e => `- [${e.type}] ${e.content}`)
      .join('\n');
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at summarizing academic presentations. Create a concise, well-structured summary highlighting key points, arguments, and areas that need clarification.',
        },
        {
          role: 'user',
          content: `Summarize this presentation:\n\nTranscript:\n${transcript}\n\nKey Events Identified:\n${eventsSummary}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || 'Summary not available.';
  } catch (error) {
    console.error('Summary generation error:', error);
    return 'Failed to generate summary.';
  }
}

// ============================================
// Batch Question Generation
// ============================================

export async function generateBatchQuestions(
  events: SemanticEvent[],
  transcript: string
): Promise<GeneratedQuestion[]> {
  const allQuestions: GeneratedQuestion[] = [];
  
  for (const event of events) {
    const questions = await generateQuestionsFromEvent(event, {
      recentTranscript: transcript,
      previousEvents: events.filter(e => e.timestamp < event.timestamp),
      previousQuestions: allQuestions,
    });
    allQuestions.push(...questions);
  }
  
  return allQuestions;
}

