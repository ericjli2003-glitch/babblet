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

  const system = `You are a careful academic fact-checking assistant.

Important constraints:
- You do NOT have browsing access.
- You must NOT claim certainty about real-world facts without evidence.
- Your job is to flag statements that likely need verification and explain what to verify.

Return a small list (3-7) of high-value verification findings. Prioritize:
- numbers, dates, statistics, technical claims
- causal claims presented as fact
- claims that sound dubious, oversimplified, or missing key qualifiers

For each finding, include a short quote from the transcript (relevantSnippet) to anchor where it came from.`;

  const user = `TRANSCRIPT (recent excerpt):
${transcriptTrimmed}

${claimsTrimmed.length ? `KEY CLAIMS (may help focus):
${claimsTrimmed.map((x) => `- ${x}`).join('\n')}` : ''}

Return JSON only in this schema:
{
  "findings": [
    {
      "statement": "verbatim or near-verbatim statement to verify",
      "verdict": "likely-true" | "uncertain" | "likely-false",
      "confidence": 0.0-1.0,
      "explanation": "why this needs verification / what seems off",
      "whatToVerify": "what evidence/source would confirm it",
      "suggestedCorrection": "optional: a safer corrected phrasing if likely false",
      "relevantSnippet": "5-15 word quote from transcript"
    }
  ]
}`;

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


