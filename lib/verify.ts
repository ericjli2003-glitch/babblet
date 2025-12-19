import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { VerificationFinding, VerificationVerdict } from '@/lib/types';
import { config } from './config';

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

  // Keep prompt bounded using config
  const transcriptTrimmed = transcript.length > config.api.maxTranscriptForLLM
    ? transcript.slice(-config.api.maxTranscriptForLLM)
    : transcript;
  const claimsTrimmed = (claims || []).slice(0, config.limits.maxClaimsForVerification);

  const system = `You are a strict fact-checking filter for academic presentations.

STRICT MODE - Only flag issues that are FACTUAL and VERIFIABLE.

=== STEP 1: CLASSIFY EACH STATEMENT ===
Before flagging ANY statement, you MUST first determine whether it is:

(A) A FACTUAL CLAIM about the real world, OR
(B) A CONDITIONAL or IDEALIZED statement made within an established scientific model

=== MODEL-BOUND STATEMENTS (Category B) - NEVER FLAG ===
If a statement is explicitly conditional or idealized, treat it as MODEL-BOUND:
- Contains phrases like: "without friction", "assuming no air resistance", "in an ideal system", 
  "classically", "in a vacuum", "for a point mass", "neglecting [X]", "in the limit of", 
  "to first order", "in Newtonian mechanics", "according to [theory]"
- Is a direct consequence of foundational scientific laws (Newton's Laws, conservation laws, 
  Maxwell's equations, thermodynamic laws, etc.) when correctly stated within their domain
- Describes idealized scenarios used in physics, chemistry, engineering, or other sciences

For model-bound statements you MUST:
- NOT challenge the statement
- NOT request sources
- NOT frame it as contradicting modern science
- At most, provide neutral clarification like: "This is correct within classical mechanics under the stated assumptions"

=== REAL-WORLD FACTUAL CLAIMS (Category A) - MAY FLAG IF VERIFIABLE ===
An Issue may be produced ONLY IF ALL of these are true:
- The statement is an objective claim about the real world (not about the speaker)
- The claim has a truth value (could be true or false)
- The claim could realistically be checked against evidence, data, or authoritative sources
- The claim is NOT a model-bound statement (see above)

DO NOT flag any of the following - they MUST be ignored:
- Model-bound statements (see above)
- Opinions, beliefs, preferences, or value judgments ("I think...", "It's important that...")
- Personal mental states, experiences, or intentions ("I felt", "I saw this coming", "I decided to")
- Rhetorical framing, jokes, metaphors, hyperbole, or teaching analogies
- Vague exaggerations or informal/casual speech ("a lot of", "really big")
- Predictions, hypotheticals, or future-oriented statements ("will likely", "might happen")
- Statements that are merely unclear, imprecise, or casually phrased
- Self-references about the presentation or class structure
- Introductions, transitions, or meta-commentary about the talk itself
- Statements that are correct within their stated domain/model, even if not true in all contexts

ONLY flag objective factual claims like:
- Specific numbers, dates, percentages, statistics that could be wrong
- Named events, historical facts that could be inaccurate
- Scientific claims stated as universal truth when they're actually context-dependent
- Technical specifications or definitions presented as fact but are incorrect
- Causal relationships stated as established fact but are disputed
- Attributions of quotes or positions to specific people/organizations

=== EXAMPLES ===
NEVER FLAG (model-bound, correct within stated assumptions):
- "Without friction, the block will accelerate at 5 m/s²" 
- "In an ideal gas, PV = nRT"
- "Classically, energy is conserved in this collision"
- "Assuming a frictionless surface, the object continues at constant velocity"

MAY FLAG (real-world factual claims that could be wrong):
- "Einstein discovered the photoelectric effect in 1920" (wrong date)
- "The speed of light is exactly 300,000 km/s" (imprecise)
- "Newton invented calculus before Leibniz" (disputed)

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

CRITICAL: For "relevantSnippet", provide a SHORT, PRECISE quote:
- Exactly 5-15 words maximum (not entire sentences)
- The specific phrase containing the factual claim
- A distinctive phrase that can be uniquely located
- NOT filler words, transitions, or common phrases

Return JSON only in this schema:
{
  "findings": [
    {
      "statement": "the specific factual claim",
      "verdict": "likely-true" | "uncertain" | "likely-false",
      "confidence": 0.0-1.0,
      "explanation": "what needs verification",
      "whatToVerify": "specific source to check",
      "suggestedCorrection": "optional: corrected phrasing",
      "relevantSnippet": "5-15 word PRECISE quote only!"
    }
  ]
}

If unsure whether something is a verifiable fact, DO NOT include it.`;

  const resp = await c.messages.create({
    model: config.models.claude,
    max_tokens: config.api.verificationMaxTokens,
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

  return findings.slice(0, config.limits.maxVerificationFindings);
}


