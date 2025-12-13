import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { GeneratedQuestion, AnalysisSummary, KeyClaim, LogicalGap, MissingEvidence } from './types';

// Lazy-load Claude client to avoid build-time errors
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Slide content type
interface SlideContent {
  text?: string;
  keyPoints?: string[];
  topics?: string[];
}

// Generate questions using Claude Sonnet 4
export async function generateQuestionsWithClaude(
  transcript: string,
  analysis?: AnalysisSummary,
  slideContent?: SlideContent
): Promise<GeneratedQuestion[]> {
  const client = getAnthropicClient();

  const systemPrompt = `You are an expert educational AI assistant helping professors generate insightful questions during student presentations. Your goal is to create questions that:
1. Help clarify unclear points
2. Encourage critical thinking
3. Expand on interesting topics
4. Identify gaps in reasoning or evidence
5. Connect verbal presentation to slide content (if provided)

Generate questions that are appropriate for an academic setting and would help the student demonstrate deeper understanding.`;

  // Build slide context section
  let slideContextSection = '';
  if (slideContent) {
    slideContextSection = `
PRESENTATION SLIDES CONTENT:
${slideContent.text ? `- Slide Text: ${slideContent.text}` : ''}
${slideContent.keyPoints?.length ? `- Key Points from Slides: ${slideContent.keyPoints.join('; ')}` : ''}
${slideContent.topics?.length ? `- Topics Covered in Slides: ${slideContent.topics.join('; ')}` : ''}

Consider asking questions that:
- Connect what the student said to what's shown on their slides
- Probe deeper into topics mentioned in slides but not fully explained verbally
- Ask about data or visuals shown in the slides
`;
  }

  const userPrompt = `Based on this presentation transcript${slideContent ? ' and their presentation slides' : ''}, generate 3-5 high-quality questions.

TRANSCRIPT:
${transcript}

${analysis ? `
ANALYSIS CONTEXT:
- Key Claims: ${analysis.keyClaims.map(c => c.claim).join('; ')}
- Logical Gaps: ${analysis.logicalGaps.map(g => g.description).join('; ')}
- Missing Evidence: ${analysis.missingEvidence.map(e => e.description).join('; ')}
` : ''}
${slideContextSection}

Generate questions in the following JSON format:
{
  "questions": [
    {
      "question": "The question text",
      "category": "clarifying" | "critical-thinking" | "expansion",
      "difficulty": "easy" | "medium" | "hard",
      "rationale": "Why this question is valuable"
    }
  ]
}

Respond ONLY with the JSON, no additional text.`;

  try {
    console.log('[Claude] Generating questions...');
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    const responseText = textContent.text.trim();
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const questions: GeneratedQuestion[] = (parsed.questions || []).map((q: any) => ({
      id: uuidv4(),
      question: q.question,
      category: q.category || 'clarifying',
      difficulty: q.difficulty || 'medium',
      rationale: q.rationale || '',
      timestamp: Date.now(),
    }));

    console.log('[Claude] Generated', questions.length, 'questions');
    return questions;
  } catch (error) {
    console.error('[Claude] Question generation error:', error);
    throw error;
  }
}

// Analyze transcript using Claude
export async function analyzeWithClaude(transcript: string): Promise<AnalysisSummary> {
  const client = getAnthropicClient();

  const systemPrompt = `You are an expert at analyzing presentations and identifying key claims, logical gaps, and areas needing more evidence. Provide structured analysis.`;

  const userPrompt = `Analyze this presentation transcript and identify:
1. Key claims being made
2. Logical gaps or unclear reasoning
3. Areas where more evidence is needed
4. Overall strength assessment (1-5)
5. Suggestions for improvement

TRANSCRIPT:
${transcript}

Respond in this JSON format:
{
  "keyClaims": [
    {"claim": "The claim text", "evidence": ["supporting points"], "confidence": 0.8}
  ],
  "logicalGaps": [
    {"description": "Gap description", "severity": "minor" | "moderate" | "major", "suggestion": "How to fix"}
  ],
  "missingEvidence": [
    {"description": "What's missing", "relatedClaim": "Which claim needs it", "importance": "low" | "medium" | "high"}
  ],
  "overallStrength": 3.5,
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}

Respond ONLY with the JSON, no additional text.`;

  try {
    console.log('[Claude] Analyzing transcript...');
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    const responseText = textContent.text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const keyClaims: KeyClaim[] = (parsed.keyClaims || []).map((c: any) => ({
      id: uuidv4(),
      claim: c.claim,
      evidence: c.evidence || [],
      confidence: c.confidence || 0.5,
      timestamp: Date.now(),
    }));

    const logicalGaps: LogicalGap[] = (parsed.logicalGaps || []).map((g: any) => ({
      id: uuidv4(),
      description: g.description,
      severity: g.severity || 'moderate',
      suggestion: g.suggestion || '',
    }));

    const missingEvidence: MissingEvidence[] = (parsed.missingEvidence || []).map((e: any) => ({
      id: uuidv4(),
      description: e.description,
      relatedClaim: e.relatedClaim || '',
      importance: e.importance || 'medium',
    }));

    const analysis: AnalysisSummary = {
      keyClaims,
      logicalGaps,
      missingEvidence,
      overallStrength: parsed.overallStrength || 3,
      suggestions: parsed.suggestions || [],
      timestamp: Date.now(),
    };

    console.log('[Claude] Analysis complete:', keyClaims.length, 'claims,', logicalGaps.length, 'gaps');
    return analysis;
  } catch (error) {
    console.error('[Claude] Analysis error:', error);
    throw error;
  }
}

