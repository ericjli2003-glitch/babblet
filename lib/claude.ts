import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { GeneratedQuestion, AnalysisSummary, KeyClaim, LogicalGap, MissingEvidence, RubricEvaluation, RubricScore } from './types';
import { config } from './config';

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

// Question generation settings from user
interface QuestionGenSettings {
  assignmentContext?: string;
  rubricCriteria?: string;
  priorities?: {
    clarifying: number; // 0=none, 1=some, 2=focus
    criticalThinking: number;
    expansion: number;
  };
  focusAreas?: string[];
  existingQuestions?: string[];
}

// Generate questions using Claude Sonnet 4
export async function generateQuestionsWithClaude(
  transcript: string,
  analysis?: AnalysisSummary,
  slideContent?: SlideContent,
  settings?: QuestionGenSettings
): Promise<GeneratedQuestion[]> {
  const client = getAnthropicClient();

  // Build priority guidance
  const priorityLabels = ['avoid', 'include some', 'prioritize'];
  const priorityGuidance = settings?.priorities
    ? `
Question Type Priorities (follow these closely):
- Clarifying questions: ${priorityLabels[settings.priorities.clarifying]}
- Critical thinking questions: ${priorityLabels[settings.priorities.criticalThinking]}  
- Expansion questions: ${priorityLabels[settings.priorities.expansion]}`
    : '';

  const systemPrompt = `You are an expert educational AI assistant helping professors generate insightful questions during student presentations.

Your goals:
1. Generate ONLY the most valuable, high-signal questions
2. Avoid generic or low-value clarifications
3. Prioritize questions about evidence, assumptions, counterarguments, and limitations
4. Questions should help students demonstrate deeper understanding
5. Never repeat or closely paraphrase existing questions
${priorityGuidance}

${settings?.assignmentContext ? `
ASSIGNMENT CONTEXT (align questions to this):
${settings.assignmentContext}` : ''}

${settings?.rubricCriteria ? `
GRADING CRITERIA (ask about these aspects):
${settings.rubricCriteria}` : ''}

${settings?.focusAreas?.length ? `
FOCUS AREAS (emphasize these topics):
${settings.focusAreas.join(', ')}` : ''}`;

  // Build slide context section
  let slideContextSection = '';
  if (slideContent) {
    slideContextSection = `
PRESENTATION SLIDES CONTENT:
${slideContent.text ? `- Slide Text: ${slideContent.text}` : ''}
${slideContent.keyPoints?.length ? `- Key Points from Slides: ${slideContent.keyPoints.join('; ')}` : ''}
${slideContent.topics?.length ? `- Topics Covered in Slides: ${slideContent.topics.join('; ')}` : ''}
`;
  }

  // Build existing questions section
  let existingQuestionsSection = '';
  if (settings?.existingQuestions?.length) {
    existingQuestionsSection = `
ALREADY ASKED QUESTIONS (do NOT repeat or closely paraphrase these):
${settings.existingQuestions.slice(-config.ui.existingQuestionsContext).map((q, i) => `${i + 1}. ${q}`).join('\n')}
`;
  }

  const userPrompt = `Based on this presentation, generate 2-3 high-value questions only. Quality over quantity.

TRANSCRIPT:
${transcript}

${analysis ? `
ANALYSIS CONTEXT:
- Key Claims: ${analysis.keyClaims.map(c => c.claim).join('; ')}
- Logical Gaps: ${analysis.logicalGaps.map(g => g.description).join('; ')}
- Missing Evidence: ${analysis.missingEvidence.map(e => e.description).join('; ')}
` : ''}
${slideContextSection}
${existingQuestionsSection}

Return ONLY questions that are genuinely valuable. If nothing new warrants a question, return an empty array.

CRITICAL: For each question, include a "relevantSnippet" field. This MUST be:
- A SHORT, PRECISE quote: exactly 5-15 words maximum
- The specific phrase that triggered the question (not a whole sentence or paragraph)
- A distinctive phrase that can be uniquely located in the transcript
- NOT generic filler words or common phrases

BAD examples (too long/vague):
- "So to get into the mode of thinking about this, let's consider the case I bet many of you have been thinking about..." (way too long)
- "I think" or "you know" (too generic)

GOOD examples (precise):
- "self driving cars can't turn left"
- "toaster model of cognition"
- "social cognition nobody's mastered"

JSON format:
{
  "questions": [
    {
      "question": "The question text",
      "category": "clarifying" | "critical-thinking" | "expansion",
      "difficulty": "easy" | "medium" | "hard",
      "rationale": "Why this question is valuable",
      "relevantSnippet": "5-15 word EXACT quote - be precise!"
    }
  ]
}

Respond ONLY with JSON.`;

  try {
    console.log('[Claude] Generating questions...');

    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: config.api.questionMaxTokens,
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
      relevantSnippet: q.relevantSnippet || '',
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

  const systemPrompt = `You are an expert at analyzing academic presentations. You focus on substantive issues, not minor stylistic choices.

STRICT ANALYSIS MODE:

For KEY CLAIMS:
- Only extract claims that are central to the presenter's argument
- Focus on substantive assertions, not passing remarks or transitions
- Claims should be specific enough to evaluate

For LOGICAL GAPS:
- ONLY flag genuine logical fallacies or reasoning errors
- A gap must be: a missing step in an argument, a non-sequitur, a contradiction, or an unsupported causal claim
- DO NOT flag: informal speech, teaching style choices, rhetorical questions, jokes, or things that are simply "unclear"
- DO NOT flag: presentation structure choices, pacing, or meta-commentary
- If the speaker is casually explaining something, that's not a logical gap
- When in doubt, do NOT flag a logical gap

For MISSING EVIDENCE:
- Only flag when a specific factual claim was made but no supporting evidence was provided
- The claim must be the type that actually requires evidence (not opinions or common knowledge)
- DO NOT flag: conceptual explanations, definitions, or introductory/contextual remarks

Be conservative. Flag fewer, higher-quality issues rather than many minor observations.
If the presentation is reasonably coherent, return minimal or empty gap/evidence arrays.`;

  const userPrompt = `Analyze this presentation transcript. Be conservative - only flag substantive issues.

TRANSCRIPT:
${transcript}

Apply STRICT ANALYSIS MODE. Return fewer, higher-quality findings.

IMPORTANT: For each item, include a "relevantSnippet" field with a SHORT quote (5-12 words) from the transcript - the specific phrase, not a whole sentence.

Respond in this JSON format:
{
  "keyClaims": [
    {"claim": "The central claim text", "evidence": ["supporting points"], "confidence": 0.8, "relevantSnippet": "5-12 word quote"}
  ],
  "logicalGaps": [
    {"description": "Specific logical error", "severity": "minor" | "moderate" | "major", "suggestion": "How to fix", "relevantSnippet": "5-12 word quote"}
  ],
  "missingEvidence": [
    {"description": "What evidence is missing", "relatedClaim": "Which claim", "importance": "low" | "medium" | "high", "relevantSnippet": "5-12 word quote"}
  ],
  "overallStrength": 3.5,
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}

Remember: logicalGaps and missingEvidence can be empty arrays if the presentation is coherent.

Respond ONLY with the JSON.`;

  try {
    console.log('[Claude] Analyzing transcript...');

    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: config.api.analysisMaxTokens,
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
      relevantSnippet: g.relevantSnippet || '',
    }));

    const missingEvidence: MissingEvidence[] = (parsed.missingEvidence || []).map((e: any) => ({
      id: uuidv4(),
      description: e.description,
      relatedClaim: e.relatedClaim || '',
      importance: e.importance || 'medium',
      relevantSnippet: e.relevantSnippet || '',
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

// Custom rubric criteria from user
interface CustomRubricCriteria {
  name: string;
  description: string;
  weight?: number; // 1-5, default 1
}

// Evaluate presentation using Claude with optional custom rubric
export async function evaluateWithClaude(
  transcript: string,
  customRubric?: string,
  customCriteria?: CustomRubricCriteria[],
  analysis?: AnalysisSummary | null
): Promise<RubricEvaluation> {
  const client = getAnthropicClient();

  // Build rubric context based on user input
  let rubricContext = '';

  if (customRubric && customRubric.trim()) {
    rubricContext = `
CUSTOM RUBRIC (use this as the evaluation framework):
${customRubric}

Map your evaluation to these three categories, interpreting the custom rubric criteria:
- contentQuality: How well does the content meet the rubric's content-related criteria?
- delivery: How well does the presentation meet delivery/communication criteria?
- evidenceStrength: How well does it meet evidence/support/research criteria?`;
  } else if (customCriteria && customCriteria.length > 0) {
    rubricContext = `
CUSTOM EVALUATION CRITERIA:
${customCriteria.map((c, i) => `${i + 1}. ${c.name}: ${c.description}${c.weight ? ` (weight: ${c.weight}/5)` : ''}`).join('\n')}

Evaluate based on these specific criteria, mapping to:
- contentQuality: Criteria related to content, organization, accuracy
- delivery: Criteria related to presentation, clarity, engagement
- evidenceStrength: Criteria related to evidence, sources, support`;
  } else {
    rubricContext = `
Use standard academic presentation criteria:
- contentQuality: Organization, depth of content, accuracy, completeness
- delivery: Clarity of explanation, engagement, pacing, transitions
- evidenceStrength: Quality of evidence, proper citations, logical support`;
  }

  const systemPrompt = `You are an expert at evaluating academic presentations against rubrics.
${rubricContext}

Score each category from 1-5:
1 = Poor/Missing
2 = Below expectations
3 = Meets expectations
4 = Exceeds expectations  
5 = Exceptional

Provide specific, actionable feedback tied to what the presenter actually said.`;

  const analysisContext = analysis ? `
ANALYSIS CONTEXT:
- Key Claims Made: ${analysis.keyClaims.map(c => c.claim).join('; ')}
- Identified Gaps: ${analysis.logicalGaps.map(g => g.description).join('; ')}
- Missing Evidence: ${analysis.missingEvidence.map(e => e.description).join('; ')}
- Overall Argument Strength: ${analysis.overallStrength}/5` : '';

  const userPrompt = `Evaluate this presentation:

TRANSCRIPT:
${transcript.slice(0, config.api.maxTranscriptForQuestions)}
${analysisContext}

Provide a detailed rubric evaluation. Be specific about what was done well and what could improve.

JSON format:
{
  "contentQuality": {
    "score": number,
    "feedback": "Specific feedback about content",
    "strengths": ["Strength 1", "Strength 2"],
    "improvements": ["Improvement 1", "Improvement 2"]
  },
  "delivery": {
    "score": number,
    "feedback": "Specific feedback about delivery",
    "strengths": ["Strength 1", "Strength 2"],
    "improvements": ["Improvement 1", "Improvement 2"]
  },
  "evidenceStrength": {
    "score": number,
    "feedback": "Specific feedback about evidence",
    "strengths": ["Strength 1", "Strength 2"],
    "improvements": ["Improvement 1", "Improvement 2"]
  },
  "overallScore": number,
  "overallFeedback": "Summary evaluation"
}

Respond ONLY with valid JSON.`;

  try {
    console.log('[Claude] Evaluating presentation with rubric...');

    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: config.api.evaluationMaxTokens,
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

    const rubric: RubricEvaluation = {
      contentQuality: {
        score: parsed.contentQuality?.score || 3,
        feedback: parsed.contentQuality?.feedback || 'Content evaluation',
        strengths: parsed.contentQuality?.strengths || [],
        improvements: parsed.contentQuality?.improvements || [],
      },
      delivery: {
        score: parsed.delivery?.score || 3,
        feedback: parsed.delivery?.feedback || 'Delivery evaluation',
        strengths: parsed.delivery?.strengths || [],
        improvements: parsed.delivery?.improvements || [],
      },
      evidenceStrength: {
        score: parsed.evidenceStrength?.score || 3,
        feedback: parsed.evidenceStrength?.feedback || 'Evidence evaluation',
        strengths: parsed.evidenceStrength?.strengths || [],
        improvements: parsed.evidenceStrength?.improvements || [],
      },
      overallScore: parsed.overallScore || 3,
      overallFeedback: parsed.overallFeedback || 'Evaluation complete',
      timestamp: Date.now(),
    };

    console.log('[Claude] Rubric evaluation complete, overall:', rubric.overallScore);
    return rubric;
  } catch (error) {
    console.error('[Claude] Rubric evaluation error:', error);
    throw error;
  }
}

