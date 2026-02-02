/**
 * Server-side generation of criterion-level insights during grading.
 * Called in parallel for each rubric criterion to avoid blocking.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { getCourseDocuments, getAssignmentDocuments } from '@/lib/context-store';

export interface CriterionInsightSubmissionInput {
  transcript?: string;
  transcriptSegments?: Array<{ text: string; timestamp?: number | string }>;
  rubricEvaluation?: {
    criteriaBreakdown?: Array<{ criterion: string; score?: number; maxScore?: number; feedback?: string; rationale?: string }>;
  } | null;
}

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

const FORMAT_VARIATIONS = [
  { intro: 'Lead with a direct observation', struct: 'Overview first, then bullets' },
  { intro: 'Start with a specific quote or moment', struct: 'Quote-first, then analysis' },
  { intro: 'Open with a comparative assessment', struct: 'Strengths vs gaps framing' },
  { intro: 'Begin with what stood out most', struct: 'Highlight-centric structure' },
  { intro: 'Lead with the score rationale', struct: 'Why-this-score framing' },
];

function extractCriterionRubricSection(fullRubric: string, criterionName: string): string {
  if (!fullRubric?.trim()) return '';
  const lines = fullRubric.split('\n');
  let inSection = false;
  const collected: string[] = [];
  const nameLower = criterionName.toLowerCase();
  const otherHeadings = /^(content|structure|visual|delivery|organization|knowledge|evidence|presentation)\s*(knowledge|aids|quality|strength)?\s*[:\)]/i;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.includes(nameLower) && (lower.startsWith(nameLower) || line.match(new RegExp(`\\b${criterionName}\\b`, 'i')))) {
      inSection = true;
      collected.push(line);
      continue;
    }
    if (inSection) {
      if (otherHeadings.test(line) && !line.toLowerCase().includes(nameLower)) break;
      collected.push(line);
      if (collected.join('\n').length > 800) break;
    }
  }
  return collected.join('\n').trim() || fullRubric.slice(0, 600);
}

export async function generateCriterionInsight(params: {
  criterionTitle: string;
  criterionIndex: number;
  submission: CriterionInsightSubmissionInput;
  batchCourseId?: string;
  batchAssignmentId?: string;
  fullRubricText: string;
}): Promise<string> {
  const { criterionTitle, criterionIndex, submission, batchCourseId, batchAssignmentId, fullRubricText } = params;

  const fullTranscript = (submission.transcriptSegments || [])
    .map((s: { text: string }) => s.text)
    .join(' ') || submission.transcript || '';

  const criterionData = submission.rubricEvaluation?.criteriaBreakdown?.find(
    (c: { criterion: string }) => c.criterion === criterionTitle
  );
  const criterionInfo = criterionData
    ? `Score: ${criterionData.score}/${criterionData.maxScore || 10}. Feedback: ${(criterionData.feedback || criterionData.rationale || 'N/A').slice(0, 200)}`
    : '';

  const criterionRubricOnly = extractCriterionRubricSection(fullRubricText, criterionTitle);
  const variation = FORMAT_VARIATIONS[criterionIndex % FORMAT_VARIATIONS.length];

  const expectations: Record<string, string> = {
    'Content Knowledge': 'concept accuracy, understanding depth, integration of material, factual correctness',
    'Structure': 'organization, logical flow, transitions, introduction/conclusion quality',
    'Visual Aids': 'slide design, visual clarity, appropriate use of graphics, readability',
    'Delivery': 'speaking pace, eye contact, voice clarity, confidence, engagement',
  };
  const expectationsForCriterion = expectations[criterionTitle] || `what the rubric says about ${criterionTitle}`;

  // Fetch course materials
  let courseMaterials: Array<{ name: string; type: string; excerpt: string }> = [];
  if (batchCourseId) {
    try {
      const docs = await getCourseDocuments(batchCourseId);
      courseMaterials = docs.slice(0, 8).map((d: { name: string; type: string; rawText: string }) => ({
        name: d.name,
        type: d.type,
        excerpt: d.rawText.substring(0, 1200) + (d.rawText.length > 1200 ? '...' : ''),
      }));
    } catch (e) {
      console.log('[GenerateCriterionInsight] Could not fetch course docs:', e);
    }
  }
  if (batchAssignmentId && courseMaterials.length < 10) {
    try {
      const assignDocs = await getAssignmentDocuments(batchAssignmentId);
      const assignMats = assignDocs.slice(0, 4).map((d: { name: string; type: string; rawText: string }) => ({
        name: `[Assignment] ${d.name}`,
        type: d.type,
        excerpt: d.rawText.substring(0, 1200) + (d.rawText.length > 1200 ? '...' : ''),
      }));
      courseMaterials = [...courseMaterials, ...assignMats].slice(0, 10);
    } catch (e) {
      console.log('[GenerateCriterionInsight] Could not fetch assignment docs:', e);
    }
  }

  const courseContext = courseMaterials.length > 0
    ? `\n\nCOURSE MATERIALS:\n${courseMaterials.map((m, i) => `[${i + 1}] ${m.name}: ${m.excerpt.slice(0, 400)}...`).join('\n\n')}`
    : '';

  const systemPrompt = `You are a thoughtful TA giving rubric feedback. Be specific, varied, and non-generic.

CRITICAL: Rubric criterion = "${criterionTitle}". Analyze ONLY this criterion.
RUBRIC SECTION:
${criterionRubricOnly}

VARIATION: ${variation.intro}. ${variation.struct}.
- Vary sentence structure and opening phrases
- Use different transition words (Moreover, Notably, In contrast, Specifically)
- Avoid repetitive "The student..." - mix in "What works here...", "One strength...", "A gap..."
- Quote the transcript directly when relevant
- Reference the FULL presentation: use moments from the beginning, middle, AND end of the transcript when they fit (not just the start)
- End each bullet with A (video moment) and B (rubric/course reference) when possible—one citation from the video and one from class content per bullet. Pick the moment that best supports that bullet; order does not need to be chronological.
- Do not write (A) or (B) in parentheses. Use only the letters A and B at the end of bullets, e.g. "…quote… A B"`;

  const userMessage = `Analyze "${criterionTitle}" for this student presentation.

SCORE CONTEXT: ${criterionInfo}
FOCUS: ${expectationsForCriterion}

TRANSCRIPT (quote specific moments from beginning, middle, and end):
${fullTranscript.slice(0, 16000)}${fullTranscript.length > 16000 ? '...' : ''}
${courseContext}

Provide:
**Overview** (2-3 sentences, ${variation.intro.toLowerCase()})

**What worked well:**
- [Specific strength with quote] A B
- [Another strength] A B

**Areas to develop:**
- [Specific gap] A B
- [Rubric expectation missing] A B

**Example of excellence:** One sentence.

RULES: End each bullet with A B (video moment + rubric/course ref). Do not use (A) or (B)—only the letters A and B. Be specific. Vary phrasing. No generic feedback.`;

  const client = getClient();
  const response = await client.messages.create({
    model: config.models.claude,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  return text.trim();
}
