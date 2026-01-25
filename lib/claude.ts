import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { GeneratedQuestion, AnalysisSummary, KeyClaim, LogicalGap, MissingEvidence, RubricEvaluation, RubricScore } from './types';
import { config } from './config';

// Lazy-load AI client to avoid build-time errors
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
  maxQuestions?: number;
  remainingQuestions?: number;
  assignmentContext?: string;
  rubricCriteria?: string;
  rubricTemplateId?: string;
  targetDifficulty?: 'mixed' | 'easy' | 'medium' | 'hard';
  bloomFocus?: 'mixed' | 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  priorities?: {
    // New comprehensive categories
    clarification?: number; // 0=avoid, 1=include some, 2=prioritize
    evidence?: number;
    assumption?: number;
    counterargument?: number;
    application?: number;
    synthesis?: number;
    evaluation?: number;
    methodology?: number;
    limitation?: number;
    implication?: number;
    // Legacy categories (mapped internally)
    clarifying?: number;
    criticalThinking?: number;
    expansion?: number;
  };
  focusAreas?: string[];
  existingQuestions?: string[];
}

function normalizeDifficulty(value: unknown): GeneratedQuestion['difficulty'] {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  return 'medium';
}

// All valid question categories (new + legacy)
const VALID_CATEGORIES: GeneratedQuestion['category'][] = [
  // New comprehensive categories
  'clarification', 'evidence', 'assumption', 'counterargument', 
  'application', 'synthesis', 'evaluation', 'methodology', 
  'limitation', 'implication',
  // Legacy categories
  'clarifying', 'critical-thinking', 'expansion'
];

function normalizeCategory(value: unknown): GeneratedQuestion['category'] {
  const strVal = String(value).toLowerCase().trim();
  
  // Direct match for any valid category
  if (VALID_CATEGORIES.includes(strVal as GeneratedQuestion['category'])) {
    return strVal as GeneratedQuestion['category'];
  }
  
  // Handle variations and mappings
  const mappings: Record<string, GeneratedQuestion['category']> = {
    'criticalthinking': 'assumption',
    'critical_thinking': 'assumption',
    'critical thinking': 'assumption',
    'challenge': 'assumption',
    'counter': 'counterargument',
    'counter-argument': 'counterargument',
    'defend': 'counterargument',
    'apply': 'application',
    'real-world': 'application',
    'realworld': 'application',
    'connect': 'synthesis',
    'integrate': 'synthesis',
    'judge': 'evaluation',
    'assess': 'evaluation',
    'method': 'methodology',
    'process': 'methodology',
    'approach': 'methodology',
    'limit': 'limitation',
    'boundary': 'limitation',
    'edge-case': 'limitation',
    'future': 'implication',
    'consequence': 'implication',
    'next-step': 'implication',
    'proof': 'evidence',
    'data': 'evidence',
    'source': 'evidence',
    'explain': 'clarification',
    'define': 'clarification',
    'expand': 'synthesis',
  };
  
  if (mappings[strVal]) {
    return mappings[strVal];
  }
  
  // Default fallback
  return 'clarification';
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diceCoefficient(a: string, b: string): number {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const bigrams = (t: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) {
      const bg = t.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
    return set;
  };
  const A = bigrams(aa);
  const B = bigrams(bb);
  let overlap = 0;
  A.forEach((cA, bg) => {
    const cB = B.get(bg);
    if (cB) overlap += Math.min(cA, cB);
  });
  const sizeA = Array.from(A.values()).reduce((s, n) => s + n, 0);
  const sizeB = Array.from(B.values()).reduce((s, n) => s + n, 0);
  return (2 * overlap) / (sizeA + sizeB);
}

function dedupeQuestions(
  candidates: GeneratedQuestion[],
  existing: string[] = [],
  threshold = 0.88
): GeneratedQuestion[] {
  const kept: GeneratedQuestion[] = [];
  for (const q of candidates) {
    const tooCloseToExisting = existing.some((e) => diceCoefficient(q.question, e) >= threshold);
    if (tooCloseToExisting) continue;
    const tooCloseToKept = kept.some((k) => diceCoefficient(q.question, k.question) >= threshold);
    if (tooCloseToKept) continue;
    kept.push(q);
  }
  return kept;
}

function selectDiverseTop(
  candidates: GeneratedQuestion[],
  count: number,
  priorities?: QuestionGenSettings['priorities'],
  wantsEvidenceMix?: boolean
): GeneratedQuestion[] {
  if (count <= 0) return [];
  if (candidates.length <= count) return candidates.slice(0, count);

  const sorted = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  
  // Initialize all category buckets
  const byCategory: Partial<Record<GeneratedQuestion['category'], GeneratedQuestion[]>> = {};
  for (const cat of VALID_CATEGORIES) {
    byCategory[cat] = [];
  }
  for (const q of sorted) {
    if (!byCategory[q.category]) byCategory[q.category] = [];
    byCategory[q.category]!.push(q);
  }

  const weight = (k: string) => {
    const p = priorities?.[k as keyof NonNullable<QuestionGenSettings['priorities']>];
    if (p === 0) return 0;
    if (p === 2) return 3;
    return 1;
  };

  // Build category order based on priorities, favoring diverse question types
  const categoryOrder: Array<GeneratedQuestion['category']> = [];
  
  // New categories with default weights (higher priority types first)
  const newCategories: Array<{ cat: GeneratedQuestion['category']; key: string }> = [
    { cat: 'evidence', key: 'evidence' },
    { cat: 'assumption', key: 'assumption' },
    { cat: 'counterargument', key: 'counterargument' },
    { cat: 'application', key: 'application' },
    { cat: 'evaluation', key: 'evaluation' },
    { cat: 'methodology', key: 'methodology' },
    { cat: 'limitation', key: 'limitation' },
    { cat: 'synthesis', key: 'synthesis' },
    { cat: 'implication', key: 'implication' },
    { cat: 'clarification', key: 'clarification' },
  ];
  
  // Add new categories based on their weights
  for (const { cat, key } of newCategories) {
    const w = weight(key);
    for (let i = 0; i < w; i++) categoryOrder.push(cat);
  }
  
  // Also check legacy priorities and map them
  const wClar = weight('clarifying');
  const wCrit = weight('criticalThinking');
  const wExp = weight('expansion');
  for (let i = 0; i < wCrit; i++) categoryOrder.push('assumption');
  for (let i = 0; i < wExp; i++) categoryOrder.push('application');
  for (let i = 0; i < wClar; i++) categoryOrder.push('clarification');
  
  // Default diverse mix if no priorities set
  if (categoryOrder.length === 0) {
    categoryOrder.push('evidence', 'assumption', 'counterargument', 'application', 
      'evaluation', 'methodology', 'limitation', 'synthesis', 'implication', 'clarification');
  }

  const picked: GeneratedQuestion[] = [];
  const pickOne = (pool: GeneratedQuestion[]) => {
    const next = pool.shift();
    if (next) picked.push(next);
  };

  // Evidence guard: if requested, try to pick one evidence-tagged question early (when possible)
  if (wantsEvidenceMix && count >= 2) {
    const evidenceIdx = sorted.findIndex(
      (q) => (q.tags || []).includes('evidence') || !!q.expectedEvidenceType
    );
    if (evidenceIdx >= 0) {
      const q = sorted[evidenceIdx];
      // remove from its category pool
      const pool = byCategory[q.category];
      if (pool) {
        const j = pool.findIndex((x) => x.id === q.id);
        if (j >= 0) pool.splice(j, 1);
      }
      picked.push(q);
    }
  }

  let i = 0;
  while (picked.length < count) {
    const cat = categoryOrder[i % categoryOrder.length];
    const pool = byCategory[cat];
    if (pool && pool.length > 0) {
      pickOne(pool);
    } else {
      // fallback: first non-empty pool
      const fallbackCat = (Object.keys(byCategory) as Array<GeneratedQuestion['category']>).find(
        (c) => (byCategory[c]?.length ?? 0) > 0
      );
      if (!fallbackCat) break;
      const fallbackPool = byCategory[fallbackCat];
      if (fallbackPool) pickOne(fallbackPool);
    }
    i++;
  }

  return picked.slice(0, count);
}

// Generate questions using Babblet AI
export async function generateQuestionsWithClaude(
  transcript: string,
  analysis?: AnalysisSummary,
  slideContent?: SlideContent,
  settings?: QuestionGenSettings
): Promise<GeneratedQuestion[]> {
  const client = getAnthropicClient();

  // Build priority guidance for new category system
  const priorityLabels = ['avoid', 'include some', 'prioritize'];
  const buildPriorityGuidance = () => {
    if (!settings?.priorities) return '';
    const lines: string[] = [];
    const cats = [
      { key: 'evidence', label: 'Evidence Request' },
      { key: 'assumption', label: 'Assumption Challenge' },
      { key: 'counterargument', label: 'Counterargument' },
      { key: 'application', label: 'Application' },
      { key: 'synthesis', label: 'Synthesis' },
      { key: 'evaluation', label: 'Evaluation' },
      { key: 'methodology', label: 'Methodology' },
      { key: 'limitation', label: 'Limitation' },
      { key: 'implication', label: 'Implication' },
      { key: 'clarification', label: 'Clarification' },
    ];
    for (const { key, label } of cats) {
      const p = settings.priorities[key as keyof typeof settings.priorities];
      if (p !== undefined) {
        lines.push(`- ${label}: ${priorityLabels[p]}`);
      }
    }
    return lines.length > 0 ? `\nQuestion Type Priorities:\n${lines.join('\n')}` : '';
  };
  const priorityGuidance = buildPriorityGuidance();

  const systemPrompt = `You are an expert educational AI assistant helping professors generate diverse, high-signal, rubric-aligned questions during student presentations.

QUESTION CATEGORIES (use these exact category values):
1. "evidence" - Evidence Request: "What data/sources support your claim that...?" Requests proof, data, citations.
2. "assumption" - Assumption Challenge: "You seem to assume X, but what if...?" Challenges underlying premises.
3. "counterargument" - Counterargument: "How would you respond to someone who argues...?" Tests defense skills.
4. "application" - Application: "How would this apply to [real scenario]...?" Tests practical transfer.
5. "synthesis" - Synthesis: "How does this connect to [related concept]...?" Tests integration of ideas.
6. "evaluation" - Evaluation: "How would you assess the validity of...?" Tests judgment and critique.
7. "methodology" - Methodology: "Why did you choose this approach instead of...?" Questions process decisions.
8. "limitation" - Limitation: "What are the limitations or edge cases of...?" Explores boundaries.
9. "implication" - Implication: "What are the consequences or next steps...?" Explores future directions.
10. "clarification" - Clarification: "Can you explain what you mean by...?" Seeks clearer explanation.

Your goals:
1. Generate diverse questions across MULTIPLE categories (aim for at least 3 different categories)
2. Avoid generic or low-value clarifications - every question should challenge the student
3. Prioritize evidence, assumptions, counterarguments, limitations, and methodology questions
4. Questions should help students demonstrate deeper understanding and critical thinking
5. Never repeat or closely paraphrase existing questions
6. Do NOT invent facts; anchor questions to the transcript
7. Match questions to what was actually said - be specific to the content
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

  const wantsEvidence = !!settings?.rubricCriteria?.match(/evidence|source|citation|cite|references|data|study|studies|research/i);
  const remaining = Math.max(0, settings?.remainingQuestions ?? settings?.maxQuestions ?? 10);
  // Allow up to 20 questions to be returned (was incorrectly capped at 3)
  const returnCount = Math.max(1, Math.min(20, remaining));
  const candidateCount = Math.max(
    returnCount + 3,
    Math.min(config.limits.maxQuestionCandidates, Math.max(returnCount * 2, 12))
  );
  
  console.log('[Babblet AI] Requested:', remaining, 'questions, will return:', returnCount);

  const difficultyGuidance =
    settings?.targetDifficulty && settings.targetDifficulty !== 'mixed'
      ? `Aim for overall difficulty: ${settings.targetDifficulty}.`
      : 'Use a mix of easy/medium/hard as appropriate.';

  const bloomGuidance =
    settings?.bloomFocus && settings.bloomFocus !== 'mixed'
      ? `Prefer Bloom level: ${settings.bloomFocus}.`
      : 'Use a mix of Bloom levels (remember/understand/apply/analyze/evaluate/create).';

  const userPrompt = `Based on this presentation, generate exactly ${returnCount} high-quality questions.

Step 1: Generate ${candidateCount} candidate questions internally.
Step 2: Rank them by rubric alignment + assignment relevance + novelty (not repeating existing questions).
Step 3: Deduplicate near-duplicates and ensure diversity across question types.
Step 4: Return exactly ${returnCount} questions in the final "questions" list.

IMPORTANT: You MUST return exactly ${returnCount} questions. Not fewer, not more.

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

DIFFICULTY / COGNITIVE SKILL:
- ${difficultyGuidance}
- ${bloomGuidance}

HALLUCINATION + EVIDENCE GUARD:
- Do NOT invent facts not present in the transcript.
- If a question asks for support, it MUST request a SPECIFIC evidence type (e.g., dataset, peer-reviewed study, primary source, citation, calculation, measurement).
- ${wantsEvidence ? 'The rubric strongly suggests evidence matters: ensure at least one returned question asks for specific evidence.' : 'Only request evidence when it would materially strengthen a claim.'}

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

CATEGORY DIVERSITY REQUIREMENT:
- For ${returnCount} questions, use at least ${Math.min(Math.ceil(returnCount / 2), 5)} different categories
- Avoid having more than 2 questions of the same category unless specifically requested
- Prefer challenging categories (evidence, assumption, counterargument, limitation, methodology) over clarification

JSON format:
{
  "questions": [
    {
      "question": "The question text",
      "category": "evidence" | "assumption" | "counterargument" | "application" | "synthesis" | "evaluation" | "methodology" | "limitation" | "implication" | "clarification",
      "difficulty": "easy" | "medium" | "hard",
      "bloomLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "rationale": "Why this question is valuable and what it tests (1-2 sentences)",
      "rubricCriterion": "Which rubric criterion this targets (short label)",
      "rubricJustification": "Why it matches the rubric/assignment (1 sentence)",
      "expectedEvidenceType": "If applicable: specific evidence type to request (short)",
      "tags": ["evidence" | "assumption" | "counterargument" | "definition" | "mechanism" | "limitations" | "methods" | "clarity"],
      "score": 0-100,
      "relevantSnippet": "5-15 word EXACT quote from transcript - be precise!"
    }
  ]
}

Respond ONLY with valid JSON.`;

  try {
    console.log('[Babblet AI] Generating questions...');

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

    const rawQuestions: GeneratedQuestion[] = (parsed.questions || []).map((q: any) => ({
      id: uuidv4(),
      question: String(q.question || '').trim(),
      category: normalizeCategory(q.category),
      difficulty: normalizeDifficulty(q.difficulty),
      rationale: typeof q.rationale === 'string' ? q.rationale : '',
      rubricCriterion: typeof q.rubricCriterion === 'string' ? q.rubricCriterion : undefined,
      rubricJustification: typeof q.rubricJustification === 'string' ? q.rubricJustification : undefined,
      bloomLevel: typeof q.bloomLevel === 'string' ? q.bloomLevel : undefined,
      expectedEvidenceType: typeof q.expectedEvidenceType === 'string' ? q.expectedEvidenceType : undefined,
      score: typeof q.score === 'number' ? q.score : undefined,
      tags: Array.isArray(q.tags) ? q.tags.map((t: any) => String(t)) : undefined,
      relevantSnippet: typeof q.relevantSnippet === 'string' ? q.relevantSnippet : '',
      timestamp: Date.now(),
    })).filter((q: GeneratedQuestion) => q.question.length > 0);

    // Enforce novelty + dedupe + diversity on our side too (belt-and-suspenders)
    const existing = settings?.existingQuestions || [];
    const deduped = dedupeQuestions(rawQuestions, existing);
    const selected = selectDiverseTop(deduped, returnCount, settings?.priorities, wantsEvidence);

    console.log('[Babblet AI] Generated', selected.length, 'questions');
    return selected;
  } catch (error) {
    console.error('[Babblet AI] Question generation error:', error);
    throw error;
  }
}

// Analyze transcript using Babblet AI
export async function analyzeWithClaude(transcript: string): Promise<AnalysisSummary> {
  const client = getAnthropicClient();

  const systemPrompt = `You are an expert at analyzing academic presentations. You focus on substantive issues, not minor stylistic choices.

STRICT ANALYSIS MODE:

=== CRITICAL: MODEL-BOUND STATEMENTS ===
Before flagging any statement as a gap or missing evidence, determine whether it is:
(A) A factual claim about the real world, OR
(B) A conditional/idealized statement within an established scientific model

MODEL-BOUND statements (Category B) MUST NOT be flagged:
- Statements with "without friction", "assuming no air resistance", "in an ideal system", 
  "classically", "in a vacuum", "for a point mass", "neglecting [X]", etc.
- Direct consequences of foundational scientific laws (Newton's Laws, conservation laws, 
  Maxwell's equations, thermodynamic laws) when correctly stated within their domain
- Idealized scenarios used in physics, chemistry, engineering, or other sciences

For model-bound statements: DO NOT challenge, DO NOT request sources, DO NOT flag as issues.

=== For KEY CLAIMS ===
- Only extract claims that are central to the presenter's argument
- Focus on substantive assertions, not passing remarks or transitions
- Claims should be specific enough to evaluate

=== For LOGICAL GAPS ===
- ONLY flag genuine logical fallacies or reasoning errors in REAL-WORLD claims
- A gap must be: a missing step in an argument, a non-sequitur, a contradiction, or an unsupported causal claim
- DO NOT flag: model-bound statements that are correct within their stated assumptions
- DO NOT flag: informal speech, teaching style choices, rhetorical questions, jokes, or things that are simply "unclear"
- DO NOT flag: presentation structure choices, pacing, or meta-commentary
- If the speaker is casually explaining something, that's not a logical gap
- When in doubt, do NOT flag a logical gap

=== For MISSING EVIDENCE ===
- Only flag when a REAL-WORLD factual claim was made but no supporting evidence was provided
- DO NOT flag: model-bound statements (they don't need "evidence" - they're definitionally true within their model)
- The claim must be the type that actually requires evidence (not opinions, common knowledge, or model assumptions)
- DO NOT flag: conceptual explanations, definitions, or introductory/contextual remarks

=== EXAMPLES ===
NEVER FLAG as gaps/missing evidence (model-bound, correct within assumptions):
- "Without friction, the block accelerates at 5 m/s²" - correct within Newtonian mechanics
- "In an ideal gas, PV = nRT" - definitionally true for ideal gases
- "Energy is conserved in this collision" (when framed as idealized) - conservation law

MAY FLAG as gaps/missing evidence (real-world claims):
- "Studies show X reduces Y by 50%" - where are the studies?
- "This approach is more efficient" - compared to what? evidence?

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
    console.log('[Babblet AI] Analyzing transcript...');

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
      relevantSnippet: c.relevantSnippet || '',
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

    console.log('[Babblet AI] Analysis complete:', keyClaims.length, 'claims,', logicalGaps.length, 'gaps');
    return analysis;
  } catch (error) {
    console.error('[Babblet AI] Analysis error:', error);
    throw error;
  }
}

// Custom rubric criteria from user
interface CustomRubricCriteria {
  name: string;
  description: string;
  weight?: number; // 1-5, default 1
}

// Evaluate presentation using Babblet AI with optional custom rubric
// Transcript segment for linking
interface TranscriptSegmentInput {
  id: string;
  text: string;
  timestamp: number;
  speaker?: string;
}

// Find the best matching segment for a quote
function findMatchingSegment(
  quote: string,
  segments: TranscriptSegmentInput[]
): { segmentId: string; timestamp: number; snippet: string } | null {
  if (!quote || !segments.length) return null;

  const normalizedQuote = quote.toLowerCase().trim();
  if (normalizedQuote.length < 10) return null;

  // Try exact substring match first
  for (const seg of segments) {
    if (seg.text.toLowerCase().includes(normalizedQuote)) {
      return { segmentId: seg.id, timestamp: seg.timestamp, snippet: quote };
    }
  }

  // Try fuzzy matching using Dice coefficient
  let bestMatch: TranscriptSegmentInput | null = null;
  let bestScore = 0;

  for (const seg of segments) {
    const score = diceCoefficient(quote, seg.text);
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = seg;
    }
  }

  if (bestMatch) {
    return { segmentId: bestMatch.id, timestamp: bestMatch.timestamp, snippet: quote };
  }

  return null;
}

// Context for professor-mode evaluation
export interface ProfessorContext {
  courseName?: string;
  courseCode?: string;
  term?: string;
  subjectArea?: string;
  academicLevel?: string;
  assignmentName?: string;
  assignmentInstructions?: string;
  classMaterials?: string; // Concatenated relevant materials
  evaluationGuidance?: string; // Instructor's additional guidance
}

// Grading scale configuration
export interface GradingScaleConfig {
  type: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
  maxScore?: number;
  letterGrades?: Array<{ letter: string; minScore: number; maxScore: number }>;
  bands?: Array<{ label: string; minScore: number; maxScore: number }>;
}

export async function evaluateWithClaude(
  transcript: string,
  customRubric?: string,
  customCriteria?: CustomRubricCriteria[],
  analysis?: AnalysisSummary | null,
  transcriptSegments?: TranscriptSegmentInput[],
  professorContext?: ProfessorContext,
  gradingScale?: GradingScaleConfig
): Promise<RubricEvaluation> {
  const client = getAnthropicClient();

  // =========================================================
  // PROFESSOR ROLE PRIMER - Makes Babblet behave like a professor
  // =========================================================
  const subjectContext = professorContext?.subjectArea
    ? `${professorContext.subjectArea}${professorContext.academicLevel ? ` at the ${professorContext.academicLevel} level` : ''}`
    : 'the relevant academic subject';

  const courseContext = professorContext?.courseName
    ? `\nYou are teaching "${professorContext.courseName}"${professorContext.courseCode ? ` (${professorContext.courseCode})` : ''}${professorContext.term ? ` for ${professorContext.term}` : ''}.`
    : '';

  const professorPrimer = `You are a professor teaching ${subjectContext}.${courseContext}

Your role is to evaluate student presentations EXACTLY as a professor in this field would:
- Apply the academic standards and expectations appropriate for this subject and level
- Prioritize clarity of reasoning, depth of understanding, and learning outcomes
- Write feedback as if addressing your student directly
- Be instructional, not judgmental
- Provide specific, actionable suggestions for improvement
- Recognize genuine effort and intellectual growth

CRITICAL RULES:
1. The provided rubric is AUTHORITATIVE - never invent your own grading criteria
2. Score strictly within the rubric's defined scale - no deviation
3. Ground ALL feedback in specific moments from the transcript
4. Explain improvement suggestions as a teacher would explain to a student`;

  // =========================================================
  // GRADING SCALE CONFIGURATION
  // =========================================================
  let scaleInstructions = '';
  const effectiveScale = gradingScale || { type: 'none', maxScore: 100 };

  switch (effectiveScale.type) {
    case 'points':
      scaleInstructions = `
GRADING SCALE: Point-based (${effectiveScale.maxScore || 100} points total)
- Score each criterion using the point values defined in the rubric
- The total score should sum to a maximum of ${effectiveScale.maxScore || 100} points
- Use the exact point values specified in the rubric (e.g., 15/20 points for a criterion)`;
      break;
    case 'percentage':
      scaleInstructions = `
GRADING SCALE: Percentage-based (0-100%)
- Score each criterion as a percentage of its maximum
- The overall score should be a percentage (0-100)
- Weight criteria according to the rubric percentages`;
      break;
    case 'letter':
      if (effectiveScale.letterGrades?.length) {
        scaleInstructions = `
GRADING SCALE: Letter Grades
${effectiveScale.letterGrades.map(g => `- ${g.letter}: ${g.minScore}-${g.maxScore}`).join('\n')}
- Assign letter grades based on these score ranges
- Include both the letter grade and numerical equivalent in feedback`;
      }
      break;
    case 'bands':
      if (effectiveScale.bands?.length) {
        scaleInstructions = `
GRADING SCALE: Performance Bands
${effectiveScale.bands.map(b => `- ${b.label}: ${b.minScore}-${b.maxScore}`).join('\n')}
- Use these performance bands for overall assessment
- Map criterion scores to the appropriate band`;
      }
      break;
    default:
      scaleInstructions = `
GRADING SCALE: Normalized (0-100)
- Score each criterion from 1-5 (1=Poor, 5=Exceptional)
- The overall score will be normalized to 0-100
- If no specific weights are provided, distribute evenly across criteria`;
  }

  // =========================================================
  // BUILD RUBRIC CONTEXT
  // =========================================================
  let rubricContext = '';

  if (customRubric && customRubric.trim()) {
    rubricContext = `
INSTRUCTOR-PROVIDED RUBRIC (AUTHORITATIVE - follow this exactly):
${customRubric}

You MUST:
1. Extract the rubric into discrete criteria with their defined scoring levels
2. Score each criterion using ONLY the scale defined in the rubric
3. Never add criteria not present in the rubric
4. Never score outside the rubric's defined bounds`;
  } else if (customCriteria && customCriteria.length > 0) {
    rubricContext = `
STRUCTURED EVALUATION CRITERIA (AUTHORITATIVE):
${customCriteria.map((c, i) => `${i + 1}. ${c.name}: ${c.description}${c.weight ? ` (weight: ${c.weight})` : ''}`).join('\n')}

Score each criterion according to its defined weight and description.`;
  } else {
    rubricContext = `
FALLBACK CRITERIA (use when no rubric is provided):
- Content Quality (30%): Organization, depth, accuracy, completeness
- Delivery (30%): Clarity, engagement, pacing, transitions
- Evidence Strength (40%): Quality of evidence, citations, logical support

Note: These are default criteria. Instructor-provided rubrics always override these.`;
  }

  // =========================================================
  // ASSIGNMENT & MATERIALS CONTEXT (Context Hierarchy)
  // =========================================================
  let assignmentContext = '';
  if (professorContext?.assignmentName || professorContext?.assignmentInstructions) {
    assignmentContext = `
ASSIGNMENT CONTEXT:
${professorContext.assignmentName ? `Assignment: ${professorContext.assignmentName}` : ''}
${professorContext.assignmentInstructions ? `Instructions: ${professorContext.assignmentInstructions}` : ''}`;
  }

  let materialsContext = '';
  if (professorContext?.classMaterials) {
    materialsContext = `
CLASS MATERIALS CONTEXT (Use to inform your evaluation):
${professorContext.classMaterials.slice(0, 3000)}${professorContext.classMaterials.length > 3000 ? '\n[Materials truncated]' : ''}`;
  }

  let guidanceContext = '';
  if (professorContext?.evaluationGuidance) {
    guidanceContext = `
INSTRUCTOR EVALUATION GUIDANCE:
${professorContext.evaluationGuidance}`;
  }

  // =========================================================
  // SYSTEM PROMPT (Professor Role + Grading Rules)
  // =========================================================
  const systemPrompt = `${professorPrimer}
${scaleInstructions}
${rubricContext}
${assignmentContext}
${materialsContext}
${guidanceContext}

EVALUATION RULES:
1. The rubric is the SOLE source of truth for criteria and scoring
2. Ground EVERY piece of feedback in specific transcript quotes
3. Write feedback as you would to your own student
4. Be specific about what was done well AND what to improve
5. Explain WHY something is a strength or weakness
6. Suggest concrete next steps for improvement`;

  const analysisContext = analysis ? `
PRIOR ANALYSIS (for reference):
- Key Claims: ${analysis.keyClaims.map(c => c.claim).slice(0, 5).join('; ')}
- Logical Gaps: ${analysis.logicalGaps.map(g => g.description).slice(0, 3).join('; ')}
- Missing Evidence: ${analysis.missingEvidence.map(e => e.description).slice(0, 3).join('; ')}` : '';

  const userPrompt = `Evaluate this student presentation:

TRANSCRIPT:
${transcript.slice(0, config.api.maxTranscriptForQuestions)}
${analysisContext}

Provide your evaluation following the rubric exactly. Be specific and instructional.

JSON format:
{
  "contentQuality": {
    "score": number,
    "feedback": "Specific feedback about content as a professor would give",
    "strengths": [{ "text": "Strength", "quote": "Exact transcript quote (5-20 words)" }],
    "improvements": [{ "text": "Improvement needed", "quote": "Exact transcript quote" }]
  },
  "delivery": {
    "score": number,
    "feedback": "Specific feedback about delivery",
    "strengths": [{ "text": "...", "quote": "..." }],
    "improvements": [{ "text": "...", "quote": "..." }]
  },
  "evidenceStrength": {
    "score": number,
    "feedback": "Specific feedback about evidence",
    "strengths": [{ "text": "...", "quote": "..." }],
    "improvements": [{ "text": "...", "quote": "..." }]
  },
  "overallScore": number,
  "overallFeedback": "Summary as a professor would write to the student",
  "gradingScaleUsed": "${effectiveScale.type}",
  "maxPossibleScore": ${effectiveScale.maxScore || 100},
  "criteriaBreakdown": [
    {
      "criterionId": "rubric-criterion-id-if-provided",
      "criterion": "Exact criterion name from rubric",
      "score": number,
      "maxScore": number,
      "feedback": "Specific feedback tied to transcript",
      "rationale": "Explain why this score fits, referencing class context, assignment context, and accuracy checks",
      "relevantQuotes": ["Exact quote 1", "Exact quote 2"],
      "strengths": [{ "text": "Strength", "quote": "Supporting quote" }],
      "improvements": [{ "text": "Improvement", "quote": "Relevant quote" }],
      "missingEvidence": ["Specific evidence missing based on rubric requirements"]
    }
  ]
}

CRITICAL REQUIREMENTS:
1. "criteriaBreakdown" MUST include ALL criteria from the provided rubric
2. Each criterion's "score" must use the rubric's scoring scale
3. Each criterion's "maxScore" should be the maximum for that criterion
4. "rationale" must cite class context, assignment context, or accuracy checks when applicable
5. "quote" fields must contain EXACT words from the transcript (5-20 words)
6. Write as a professor addressing your student

Respond ONLY with valid JSON.`;

  try {
    console.log('[Babblet AI] Evaluating presentation with rubric...');

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

    // Helper to extract strengths/improvements with transcript references
    const extractWithRefs = (items: any[], criterionId?: string, criterionName?: string) => {
      if (!Array.isArray(items)) return [];

      return items.map((item: any) => {
        // Handle both old string format and new object format
        const text = typeof item === 'string' ? item : (item.text || item);
        const quote = typeof item === 'object' ? item.quote : null;

        // Find matching segment if we have segments and a quote
        const transcriptRefs: Array<{ segmentId: string; timestamp: number; snippet: string }> = [];
        if (quote && transcriptSegments?.length) {
          const match = findMatchingSegment(quote, transcriptSegments);
          if (match) {
            transcriptRefs.push(match);
          }
        }

        return {
          text: String(text),
          criterionId,
          criterionName,
          transcriptRefs: transcriptRefs.length > 0 ? transcriptRefs : undefined,
        };
      });
    };

    // Helper for simple string extraction (backwards compatible)
    const extractStrings = (items: any[]) => {
      if (!Array.isArray(items)) return [];
      return items.map((item: any) => typeof item === 'string' ? item : (item.text || String(item)));
    };

    // Determine letter grade or band label if applicable
    let letterGrade: string | undefined;
    let bandLabel: string | undefined;
    const parsedGradingScale = parsed.gradingScaleUsed || effectiveScale.type;
    const parsedMaxScore = parsed.maxPossibleScore || effectiveScale.maxScore || 100;

    if (parsedGradingScale === 'letter' && effectiveScale.letterGrades?.length) {
      const score = parsed.overallScore || 0;
      const grade = effectiveScale.letterGrades.find(g => score >= g.minScore && score <= g.maxScore);
      letterGrade = grade?.letter;
    } else if (parsedGradingScale === 'bands' && effectiveScale.bands?.length) {
      const score = parsed.overallScore || 0;
      const band = effectiveScale.bands.find(b => score >= b.minScore && score <= b.maxScore);
      bandLabel = band?.label;
    }

    const rubric: RubricEvaluation = {
      contentQuality: {
        score: parsed.contentQuality?.score || 3,
        feedback: parsed.contentQuality?.feedback || 'Content evaluation',
        strengths: extractStrings(parsed.contentQuality?.strengths),
        improvements: extractStrings(parsed.contentQuality?.improvements),
      },
      delivery: {
        score: parsed.delivery?.score || 3,
        feedback: parsed.delivery?.feedback || 'Delivery evaluation',
        strengths: extractStrings(parsed.delivery?.strengths),
        improvements: extractStrings(parsed.delivery?.improvements),
      },
      evidenceStrength: {
        score: parsed.evidenceStrength?.score || 3,
        feedback: parsed.evidenceStrength?.feedback || 'Evidence evaluation',
        strengths: extractStrings(parsed.evidenceStrength?.strengths),
        improvements: extractStrings(parsed.evidenceStrength?.improvements),
      },
      overallScore: parsed.overallScore || 3,
      overallFeedback: parsed.overallFeedback || 'Evaluation complete',
      gradingScaleUsed: parsedGradingScale as RubricEvaluation['gradingScaleUsed'],
      maxPossibleScore: parsedMaxScore,
      letterGrade,
      bandLabel,
      criteriaBreakdown: Array.isArray(parsed.criteriaBreakdown)
        ? parsed.criteriaBreakdown
          .map((c: any) => {
            const criterionId = c.criterionId || `criterion-${Math.random().toString(36).slice(2, 8)}`;
            const criterionName = typeof c.criterion === 'string' ? c.criterion : 'Criterion';

            // Extract transcript references from relevant quotes
            const transcriptRefs: Array<{ segmentId: string; timestamp: number; snippet: string }> = [];
            if (Array.isArray(c.relevantQuotes) && transcriptSegments?.length) {
              for (const quote of c.relevantQuotes) {
                const match = findMatchingSegment(String(quote), transcriptSegments);
                if (match) {
                  transcriptRefs.push(match);
                }
              }
            }

            return {
              criterionId,
              criterion: criterionName,
              score: typeof c.score === 'number' ? c.score : 3,
              maxScore: typeof c.maxScore === 'number' ? c.maxScore : undefined,
              feedback: typeof c.feedback === 'string' ? c.feedback : '',
              rationale: typeof c.rationale === 'string' ? c.rationale : undefined,
              transcriptRefs: transcriptRefs.length > 0 ? transcriptRefs : undefined,
              strengths: extractWithRefs(c.strengths || [], criterionId, criterionName),
              improvements: extractWithRefs(c.improvements || [], criterionId, criterionName),
              missingEvidence: Array.isArray(c.missingEvidence) ? c.missingEvidence.map((s: any) => String(s)) : [],
            };
          })
          .filter((c: any) => c.criterion && c.feedback !== '')
        : undefined,
      timestamp: Date.now(),
    };

    console.log('[Babblet AI] Rubric evaluation complete, overall:', rubric.overallScore);
    return rubric;
  } catch (error) {
    console.error('[Babblet AI] Rubric evaluation error:', error);
    throw error;
  }
}

// ============================================
// Document Type Classification
// ============================================

export type DocumentType = 'slides' | 'lecture_notes' | 'reading' | 'policy' | 'example' | 'recording' | 'other';

interface DocumentClassification {
  type: DocumentType;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestedName?: string;
  keyTopics?: string[];
}

export async function classifyDocumentType(
  filename: string,
  textContent: string,
  existingTypes?: DocumentType[]
): Promise<DocumentClassification> {
  if (!isClaudeConfigured()) {
    console.log('[Babblet AI] Claude not configured, using fallback classification');
    return fallbackClassification(filename);
  }

  const client = getAnthropicClient();
  
  // Truncate content to avoid token limits
  const truncatedContent = textContent.slice(0, 4000);

  const prompt = `Analyze this document and classify it into one of these educational material categories:

CATEGORIES:
- slides: Presentation slides (PowerPoint, lecture slides, visual presentations)
- lecture_notes: Lecture notes, class notes, lesson summaries, study guides
- reading: Academic readings, articles, papers, textbook chapters, research papers
- policy: Syllabi, course policies, grading policies, requirements, guidelines
- example: Example work, sample assignments, templates, model answers
- recording: Transcripts of recordings, video/audio transcripts
- other: Doesn't fit above categories

FILENAME: ${filename}

CONTENT SAMPLE:
${truncatedContent}

Analyze the content structure, language, and format to determine the document type.

Respond in JSON format:
{
  "type": "one of the categories above",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of why this classification",
  "keyTopics": ["main topics covered"],
  "suggestedName": "A cleaner name for this document if the filename is unclear"
}`;

  try {
    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: validateDocumentType(parsed.type),
        confidence: parsed.confidence || 'medium',
        reasoning: parsed.reasoning || 'AI classification',
        keyTopics: parsed.keyTopics || [],
        suggestedName: parsed.suggestedName,
      };
    }

    return fallbackClassification(filename);
  } catch (error) {
    console.error('[Babblet AI] Document classification error:', error);
    return fallbackClassification(filename);
  }
}

function validateDocumentType(type: string): DocumentType {
  const validTypes: DocumentType[] = ['slides', 'lecture_notes', 'reading', 'policy', 'example', 'recording', 'other'];
  return validTypes.includes(type as DocumentType) ? (type as DocumentType) : 'other';
}

function fallbackClassification(filename: string): DocumentClassification {
  const lowerName = filename.toLowerCase();
  const ext = lowerName.split('.').pop() || '';

  // Check file extension first
  const recordingExtensions = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mp3', 'wav', 'm4a'];
  const slideExtensions = ['pptx', 'ppt', 'key', 'odp'];
  
  if (recordingExtensions.includes(ext)) {
    return { type: 'recording', confidence: 'high', reasoning: 'File extension indicates recording' };
  }
  
  if (slideExtensions.includes(ext)) {
    return { type: 'slides', confidence: 'high', reasoning: 'File extension indicates slides' };
  }

  // Check filename patterns
  const patterns: { type: DocumentType; keywords: string[]; reasoning: string }[] = [
    { type: 'slides', keywords: ['slide', 'presentation', 'deck', 'powerpoint', 'ppt'], reasoning: 'Filename suggests slides' },
    { type: 'lecture_notes', keywords: ['lecture', 'notes', 'class notes', 'lesson', 'session', 'week'], reasoning: 'Filename suggests lecture notes' },
    { type: 'reading', keywords: ['reading', 'article', 'paper', 'chapter', 'textbook', 'book', 'journal'], reasoning: 'Filename suggests reading material' },
    { type: 'policy', keywords: ['syllabus', 'policy', 'policies', 'guidelines', 'requirements', 'grading', 'rubric'], reasoning: 'Filename suggests policy document' },
    { type: 'example', keywords: ['example', 'sample', 'template', 'model', 'demo', 'exemplar'], reasoning: 'Filename suggests example material' },
    { type: 'recording', keywords: ['recording', 'video', 'audio', 'lecture video', 'class recording', 'zoom'], reasoning: 'Filename suggests recording' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => lowerName.includes(keyword))) {
      return { type: pattern.type, confidence: 'medium', reasoning: pattern.reasoning };
    }
  }

  return { type: 'other', confidence: 'low', reasoning: 'Could not determine type from filename' };
}

