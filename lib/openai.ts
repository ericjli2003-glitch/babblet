// ============================================
// OpenAI API Helper Library
// Babblet - Realtime API Integration
// ============================================

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  TranscriptSegment,
  KeyClaim,
  LogicalGap,
  MissingEvidence,
  AnalysisSummary,
  GeneratedQuestion,
  QuestionCategory,
  QuestionDifficulty,
  RubricEvaluation,
  SlideContent,
  SlideAnalysis,
} from './types';

// ============================================
// OpenAI Client Configuration (Lazy-loaded)
// ============================================

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  // Always check for API key and recreate client if needed
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  
  // Recreate client if API key changed or not initialized
  if (!_openai) {
    _openai = new OpenAI({ apiKey });
  }
  
  return _openai;
}

// Check if OpenAI is configured
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ============================================
// Audio Transcription
// ============================================

export async function transcribeAudioChunk(
  audioBuffer: Buffer,
  language: string = 'en'
): Promise<TranscriptSegment | null> {
  try {
    // Create a File-like object from the buffer for Whisper API
    const audioFile = new File([new Uint8Array(audioBuffer)], 'audio.webm', {
      type: 'audio/webm',
    });

    const response = await getOpenAIClient().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language,
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
    });

    if (!response.text || response.text.trim() === '') {
      return null;
    }

    return {
      id: uuidv4(),
      text: response.text,
      timestamp: Date.now(),
      duration: response.duration ? response.duration * 1000 : 0,
      confidence: 0.95, // Whisper doesn't provide confidence, using default
    };
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Content Analysis
// ============================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert academic presentation analyst. Your task is to analyze student presentation transcripts and identify:

1. **Key Claims**: Main arguments or assertions made by the presenter
2. **Evidence**: Supporting facts, data, or examples mentioned
3. **Logical Gaps**: Missing connections, unsupported assertions, or logical fallacies
4. **Missing Evidence**: Areas where additional support would strengthen the argument

Be rigorous but constructive. Focus on helping the presenter improve.

Respond in JSON format with the following structure:
{
  "keyClaims": [{ "claim": string, "evidence": string[], "confidence": number (0-1), "category": string }],
  "logicalGaps": [{ "description": string, "relatedClaim": string, "severity": "minor"|"moderate"|"major", "suggestion": string }],
  "missingEvidence": [{ "description": string, "relatedClaim": string, "importance": "low"|"medium"|"high" }],
  "overallStrength": number (1-5),
  "suggestions": string[]
}`;

export async function analyzeTranscript(
  transcript: string,
  slideContext?: string
): Promise<AnalysisSummary> {
  const contextAddition = slideContext 
    ? `\n\nSlide Context:\n${slideContext}`
    : '';

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: `Analyze the following presentation transcript:${contextAddition}\n\nTranscript:\n${transcript}`
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Add IDs to each item
    return {
      keyClaims: (parsed.keyClaims || []).map((claim: Omit<KeyClaim, 'id'>) => ({
        id: uuidv4(),
        ...claim,
      })),
      logicalGaps: (parsed.logicalGaps || []).map((gap: Omit<LogicalGap, 'id'>) => ({
        id: uuidv4(),
        ...gap,
      })),
      missingEvidence: (parsed.missingEvidence || []).map((evidence: Omit<MissingEvidence, 'id'>) => ({
        id: uuidv4(),
        ...evidence,
      })),
      overallStrength: parsed.overallStrength || 3,
      suggestions: parsed.suggestions || [],
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error(`Failed to analyze transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Question Generation
// ============================================

const QUESTION_GENERATION_PROMPT = `You are an expert professor helping to generate thoughtful questions for student presentations. Generate questions in three categories:

1. **Clarifying Questions**: Help understand the presentation better, address ambiguities
2. **Critical Thinking Questions**: Challenge assumptions, probe deeper into arguments
3. **Expansion Questions**: Explore related topics, consider broader implications

For each question, provide:
- The question itself
- A difficulty rating (easy, medium, hard)
- A brief rationale explaining why this question is valuable

Respond in JSON format:
{
  "clarifying": [{ "question": string, "difficulty": "easy"|"medium"|"hard", "rationale": string, "relatedClaim": string }],
  "criticalThinking": [{ "question": string, "difficulty": "easy"|"medium"|"hard", "rationale": string, "relatedClaim": string }],
  "expansion": [{ "question": string, "difficulty": "easy"|"medium"|"hard", "rationale": string, "relatedClaim": string }]
}`;

export async function generateQuestions(
  transcript: string,
  claims: KeyClaim[],
  gaps: LogicalGap[],
  questionsPerCategory: number = 3
): Promise<GeneratedQuestion[]> {
  const claimsSummary = claims.map(c => `- ${c.claim}`).join('\n');
  const gapsSummary = gaps.map(g => `- ${g.description}`).join('\n');

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: QUESTION_GENERATION_PROMPT },
        {
          role: 'user',
          content: `Generate ${questionsPerCategory} questions per category for this presentation.

Transcript Summary:
${transcript.slice(0, 3000)}${transcript.length > 3000 ? '...' : ''}

Key Claims Identified:
${claimsSummary || 'None yet'}

Logical Gaps Found:
${gapsSummary || 'None yet'}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const questions: GeneratedQuestion[] = [];

    const processCategory = (
      items: Array<{
        question: string;
        difficulty: QuestionDifficulty;
        rationale?: string;
        relatedClaim?: string;
      }>,
      category: QuestionCategory
    ) => {
      (items || []).forEach((item) => {
        questions.push({
          id: uuidv4(),
          question: item.question,
          category,
          difficulty: item.difficulty,
          rationale: item.rationale,
          relatedClaim: item.relatedClaim,
          timestamp: Date.now(),
        });
      });
    };

    processCategory(parsed.clarifying, 'clarifying');
    processCategory(parsed.criticalThinking, 'critical-thinking');
    processCategory(parsed.expansion, 'expansion');

    return questions;
  } catch (error) {
    console.error('Question generation error:', error);
    throw new Error(`Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Rubric Evaluation
// ============================================

const RUBRIC_EVALUATION_PROMPT = `You are an expert academic evaluator. Evaluate the student presentation based on:

1. **Content Quality (1-5)**: Depth, accuracy, relevance, and organization of content
2. **Delivery (1-5)**: Clarity, pacing, engagement, and communication effectiveness
3. **Evidence Strength (1-5)**: Quality and relevance of supporting evidence, citations, examples

For each criterion, provide:
- A score from 1-5
- Specific feedback
- 2-3 strengths
- 2-3 areas for improvement

Respond in JSON format:
{
  "contentQuality": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "delivery": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "evidenceStrength": { "score": number, "feedback": string, "strengths": string[], "improvements": string[] },
  "overallScore": number,
  "overallFeedback": string
}`;

export async function evaluatePresentation(
  transcript: string,
  analysis: AnalysisSummary
): Promise<RubricEvaluation> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: RUBRIC_EVALUATION_PROMPT },
        {
          role: 'user',
          content: `Evaluate this presentation:

Transcript:
${transcript}

Analysis Summary:
- Key Claims: ${analysis.keyClaims.length}
- Logical Gaps: ${analysis.logicalGaps.length}
- Missing Evidence: ${analysis.missingEvidence.length}
- Overall Strength: ${analysis.overallStrength}/5`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return {
      contentQuality: parsed.contentQuality,
      delivery: parsed.delivery,
      evidenceStrength: parsed.evidenceStrength,
      overallScore: parsed.overallScore,
      overallFeedback: parsed.overallFeedback,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Rubric evaluation error:', error);
    throw new Error(`Failed to evaluate presentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Slide/Vision Analysis
// ============================================

const VISION_ANALYSIS_PROMPT = `Analyze this presentation slide image. Extract:

1. **Main Text**: All readable text content
2. **Main Points**: Key bullet points or arguments
3. **Graphs/Charts**: Describe any visual data representations
4. **Definitions**: Any defined terms or concepts
5. **Keywords**: Important terms or phrases

Respond in JSON format:
{
  "extractedText": string,
  "mainPoints": string[],
  "graphs": string[],
  "definitions": string[],
  "keywords": string[]
}`;

export async function analyzeSlideImage(
  imageDataUrl: string,
  pageNumber: number
): Promise<SlideContent> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: VISION_ANALYSIS_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Analyze slide ${pageNumber}:` },
            { 
              type: 'image_url', 
              image_url: { 
                url: imageDataUrl,
                detail: 'high'
              } 
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return {
      pageNumber,
      imageDataUrl,
      extractedText: parsed.extractedText || '',
      mainPoints: parsed.mainPoints || [],
      graphs: parsed.graphs || [],
      definitions: parsed.definitions || [],
      keywords: parsed.keywords || [],
    };
  } catch (error) {
    console.error('Slide analysis error:', error);
    throw new Error(`Failed to analyze slide: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function analyzeAllSlides(
  slideImages: string[]
): Promise<SlideAnalysis> {
  const slidePromises = slideImages.map((image, index) =>
    analyzeSlideImage(image, index + 1)
  );

  const slides = await Promise.all(slidePromises);

  // Aggregate analysis
  const allKeywords = slides.flatMap(s => s.keywords);
  const keyTopics = Array.from(new Set(allKeywords)).slice(0, 10);
  
  const allMainPoints = slides.flatMap(s => s.mainPoints);
  const overallTheme = allMainPoints.length > 0 
    ? await generateOverallTheme(allMainPoints)
    : 'Theme not determined';

  // Generate suggested questions based on slide content
  const suggestedQuestions = await generateSlideBasedQuestions(slides);

  return {
    slides,
    overallTheme,
    keyTopics,
    suggestedQuestions,
  };
}

async function generateOverallTheme(mainPoints: string[]): Promise<string> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Based on the following main points from a presentation, generate a concise overall theme (1-2 sentences).',
        },
        {
          role: 'user',
          content: mainPoints.join('\n'),
        },
      ],
      max_tokens: 100,
    });

    return response.choices[0]?.message?.content || 'Theme not determined';
  } catch {
    return 'Theme not determined';
  }
}

async function generateSlideBasedQuestions(slides: SlideContent[]): Promise<string[]> {
  try {
    const slidesSummary = slides
      .map(s => `Slide ${s.pageNumber}: ${s.mainPoints.join(', ')}`)
      .join('\n');

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Generate 5 thoughtful questions based on these presentation slides. Return as JSON array of strings.',
        },
        {
          role: 'user',
          content: slidesSummary,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    
    const parsed = JSON.parse(content);
    return parsed.questions || [];
  } catch {
    return [];
  }
}

// ============================================
// Realtime API Helpers (WebSocket-based)
// ============================================

export interface RealtimeConfig {
  sessionId: string;
  onTranscript: (segment: TranscriptSegment) => void;
  onAnalysis: (analysis: AnalysisSummary) => void;
  onQuestion: (question: GeneratedQuestion) => void;
  onError: (error: Error) => void;
}

/**
 * Creates a connection configuration for OpenAI Realtime API
 * Note: In production, this would establish a WebSocket connection
 * to OpenAI's Realtime API endpoint
 */
export function createRealtimeConnection(config: RealtimeConfig) {
  // Realtime API endpoint configuration
  const REALTIME_API_URL = 'wss://api.openai.com/v1/realtime';
  
  return {
    url: REALTIME_API_URL,
    sessionId: config.sessionId,
    model: 'gpt-4o-realtime-preview-2024-10-01',
    
    // Connection headers
    getHeaders: () => ({
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    }),
    
    // Event handlers
    handlers: {
      onTranscript: config.onTranscript,
      onAnalysis: config.onAnalysis,
      onQuestion: config.onQuestion,
      onError: config.onError,
    },
  };
}

// ============================================
// Utility Functions
// ============================================

export function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function estimateReadingTime(text: string): number {
  const wordsPerMinute = 150;
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

export default getOpenAIClient;

