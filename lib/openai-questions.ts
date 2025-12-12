// ============================================
// OpenAI Integration
// Whisper transcription + Question generation
// ============================================

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  GeneratedQuestion,
  QuestionCategory,
  QuestionDifficulty,
  AnalysisSummary,
  RubricEvaluation,
  RubricScore,
  TranscriptSegment,
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
// Whisper Audio Transcription
// ============================================

export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<TranscriptSegment | null> {
  try {
    console.log(`[Whisper] Transcribing audio: ${audioBuffer.length} bytes, type: ${mimeType}`);
    
    const client = getOpenAIClient();
    
    // Use OpenAI's toFile helper - it handles the file creation properly
    // Key: use .ogg extension as it's well-supported and compatible with WebM/Opus data
    const file = await OpenAI.toFile(
      audioBuffer,
      'audio.ogg',
      { type: 'audio/ogg' }
    );
    
    console.log(`[Whisper] Sending to Whisper API as OGG...`);
    
    const transcription = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      response_format: 'text',
    });
    
    const text = typeof transcription === 'string' ? transcription.trim() : '';
    
    console.log(`[Whisper] Transcription result: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
    
    if (!text || text.length === 0) {
      console.log('[Whisper] No speech detected');
      return null;
    }
    
    return {
      id: uuidv4(),
      text,
      timestamp: Date.now(),
      duration: 0,
      isFinal: true,
    };
  } catch (error) {
    console.error('[Whisper] Transcription error:', error);
    throw new Error(`Whisper transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Question Generation from Transcript
// ============================================

export async function generateQuestionsFromTranscript(
  transcript: string,
  analysis?: AnalysisSummary | null
): Promise<GeneratedQuestion[]> {
  try {
    const client = getOpenAIClient();

    const analysisContext = analysis
      ? `\n\nKey Claims Identified:\n${analysis.keyClaims.map(c => `- ${c.claim}`).join('\n')}`
      : '';

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert professor skilled at Socratic questioning. Generate insightful questions to help deepen understanding of student presentations.

Generate 3-6 questions across these categories:
- clarifying: Questions that seek clarification on specific points
- critical-thinking: Questions that challenge assumptions or explore implications
- expansion: Questions that connect to broader topics or applications

For each question, provide:
- category: One of the three categories above
- difficulty: easy, medium, or hard
- rationale: Brief explanation of why this question is valuable

Respond in JSON format:
{
  "questions": [
    {
      "category": "clarifying" | "critical-thinking" | "expansion",
      "difficulty": "easy" | "medium" | "hard",
      "question": "The question text",
      "rationale": "Why this question is valuable"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Analyze this presentation transcript and generate insightful questions:\n\n${transcript.slice(0, 4000)}${analysisContext}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return [];
    }

    return parsed.questions.map((q: {
      category: QuestionCategory;
      difficulty: QuestionDifficulty;
      question: string;
      rationale?: string;
    }) => ({
      id: uuidv4(),
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      rationale: q.rationale,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Question generation error:', error);
    return [];
  }
}

// ============================================
// Rubric Evaluation
// ============================================

export async function generateRubricEvaluation(
  transcript: string,
  analysis?: AnalysisSummary | null
): Promise<RubricEvaluation> {
  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert at evaluating academic presentations. Evaluate the following presentation transcript and provide a rubric-based assessment.

Score each category from 1-5:
- contentQuality: How well-organized and informative is the content?
- delivery: How clear and engaging is the presentation style?
- evidenceStrength: How well-supported are the claims with evidence?

For each category provide:
- score: 1-5
- feedback: A sentence of feedback
- strengths: 2-3 specific strengths
- improvements: 2-3 areas for improvement

Also provide an overall score (average) and overall feedback.

Respond in JSON format:
{
  "contentQuality": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "delivery": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "evidenceStrength": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "overallScore": number,
  "overallFeedback": string
}`,
        },
        {
          role: 'user',
          content: `Evaluate this presentation:\n\n${transcript.slice(0, 4000)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content);

    return {
      contentQuality: parsed.contentQuality as RubricScore,
      delivery: parsed.delivery as RubricScore,
      evidenceStrength: parsed.evidenceStrength as RubricScore,
      overallScore: parsed.overallScore,
      overallFeedback: parsed.overallFeedback,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Rubric evaluation error:', error);

    // Return default rubric on error
    return {
      contentQuality: {
        score: 3,
        feedback: 'Unable to fully evaluate content',
        strengths: ['Content present'],
        improvements: ['Could not complete evaluation'],
      },
      delivery: {
        score: 3,
        feedback: 'Unable to fully evaluate delivery',
        strengths: ['Presentation detected'],
        improvements: ['Could not complete evaluation'],
      },
      evidenceStrength: {
        score: 3,
        feedback: 'Unable to fully evaluate evidence',
        strengths: ['Some points made'],
        improvements: ['Could not complete evaluation'],
      },
      overallScore: 3,
      overallFeedback: 'Evaluation could not be completed. Please try again.',
      timestamp: Date.now(),
    };
  }
}

// ============================================
// Generate Summary
// ============================================

export async function generateSummary(
  transcript: string
): Promise<string> {
  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at summarizing academic presentations. Create a concise, well-structured summary highlighting key points, arguments, and areas that need clarification.',
        },
        {
          role: 'user',
          content: `Summarize this presentation:\n\n${transcript.slice(0, 4000)}`,
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
