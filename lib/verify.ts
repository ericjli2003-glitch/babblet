import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { VerificationFinding, VerificationVerdict } from '@/lib/types';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

function clamp01(n: any, fallback = 0.5) {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function isVerdict(v: any): v is VerificationVerdict {
  return v === 'likely-true' || v === 'uncertain' || v === 'likely-false';
}

export async function verifyWithClaude(transcript: string, claims?: string[]): Promise<VerificationFinding[]> {
  const c = getClient();

  // Keep prompt bounded
  const transcriptTrimmed = transcript.length > 6000 ? transcript.slice(-6000) : transcript;
  const claimsTrimmed = (claims || []).slice(0, 8);

  const system = `You are a strict fact-checking filter for academic presentations.

STRICT MODE - Only flag issues that are FACTUAL and VERIFIABLE.

An Issue may be produced ONLY IF ALL of these are true:
- The statement is an objective claim about the world (not about the speaker)
- The claim has a truth value (could be true or false)
- The claim could realistically be checked against evidence, data, or authoritative sources

DO NOT flag any of the following - they MUST be ignored:
- Opinions, beliefs, preferences, or value judgments ("I think...", "It's important that...")
- Personal mental states, experiences, or intentions ("I felt", "I saw this coming", "I decided to")
- Rhetorical framing, jokes, metaphors, hyperbole, or teaching analogies
- Vague exaggerations or informal/casual speech ("a lot of", "really big")
- Predictions, hypotheticals, or future-oriented statements ("will likely", "might happen")
- Statements that are merely unclear, imprecise, or casually phrased
- Self-references about the presentation or class structure
- Introductions, transitions, or meta-commentary about the talk itself

ONLY flag objective factual claims like:
- Specific numbers, dates, percentages, statistics
- Named events, historical facts, scientific claims
- Technical specifications or definitions presented as fact
- Causal relationships stated as established fact
- Attributions of quotes or positions to specific people/organizations

If a statement is not clearly fact-checkable against external sources, DO NOT flag it.
When in doubt, do NOT flag an issue.
If no verifiable factual claims exist, return an empty findings array.

This is a fact-check filter, NOT a critique or interpretation task.`;

  const user = `TRANSCRIPT (recent excerpt):
${transcriptTrimmed}

${claimsTrimmed.length ? `KEY CLAIMS extracted (may help focus, but apply strict filter):
${claimsTrimmed.map((x) => `- ${x}`).join('\n')}` : ''}

Apply the STRICT MODE filter. Return ONLY objectively verifiable factual claims.
If none exist, return {"findings": []}.

Return JSON only in this schema:
{
  "findings": [
    {
      "statement": "the specific factual claim (verbatim or near-verbatim)",
      "verdict": "likely-true" | "uncertain" | "likely-false",
      "confidence": 0.0-1.0,
      "explanation": "what specific fact needs verification and why",
      "whatToVerify": "specific source type or evidence that would confirm/refute this",
      "suggestedCorrection": "optional: corrected phrasing if claim appears wrong",
      "relevantSnippet": "5-15 word quote from transcript containing this claim"
    }
  ]
}

Remember: If unsure whether something is a verifiable fact, DO NOT include it.`;

  const resp = await c.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: VerificationFinding[] = raw
    .map((f: any): VerificationFinding | null => {
      const verdict = isVerdict(f.verdict) ? f.verdict : 'uncertain';
      const statement = String(f.statement || '').trim();
      const explanation = String(f.explanation || '').trim();
      if (!statement || !explanation) return null;
      return {
        id: uuidv4(),
        statement,
        verdict,
        confidence: clamp01(f.confidence, 0.5),
        explanation,
        whatToVerify: f.whatToVerify ? String(f.whatToVerify).trim() : undefined,
        suggestedCorrection: f.suggestedCorrection ? String(f.suggestedCorrection).trim() : undefined,
        relevantSnippet: f.relevantSnippet ? String(f.relevantSnippet).trim() : undefined,
      };
    })
    .filter(Boolean) as VerificationFinding[];

  return findings.slice(0, 8);
}


