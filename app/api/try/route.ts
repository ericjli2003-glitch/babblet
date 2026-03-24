import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── In-memory rate store (resets on cold-start; good enough for demo) ────────
// Key: email (lowercased). Value: { credits: number, resetAt: number }
const CREDIT_STORE = new Map<string, { credits: number; resetAt: number }>();
const MAX_CREDITS = 5;
// Credits reset every 24 hours
const RESET_MS = 24 * 60 * 60 * 1000;

// ─── Guardrails ───────────────────────────────────────────────────────────────
const BLOCKED_PATTERNS = [
  /ignore (previous|above|all) instructions?/i,
  /you are now/i,
  /act as (a |an )?(?!student|presenter)/i,
  /forget (everything|all|your instructions)/i,
  /jailbreak/i,
  /prompt injection/i,
  /system prompt/i,
  /base64/i,
  /<script/i,
];

function detectMisuse(text: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(text));
}

function getCredits(email: string): { credits: number; resetAt: number } {
  const now = Date.now();
  const entry = CREDIT_STORE.get(email);
  if (!entry || now > entry.resetAt) {
    const fresh = { credits: MAX_CREDITS, resetAt: now + RESET_MS };
    CREDIT_STORE.set(email, fresh);
    return fresh;
  }
  return entry;
}

function consumeCredit(email: string): boolean {
  const entry = getCredits(email);
  if (entry.credits <= 0) return false;
  CREDIT_STORE.set(email, { ...entry, credits: entry.credits - 1 });
  return true;
}

// ─── POST /api/try ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, transcript, rubric } = body as {
      action: 'analyze' | 'questions' | 'credits';
      email: string;
      transcript?: string;
      rubric?: string;
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }
    const cleanEmail = email.toLowerCase().trim();

    // Return credit count without consuming
    if (action === 'credits') {
      const { credits } = getCredits(cleanEmail);
      return NextResponse.json({ credits, max: MAX_CREDITS });
    }

    // Guard against misuse in transcript / rubric
    const combined = `${transcript || ''} ${rubric || ''}`;
    if (detectMisuse(combined)) {
      return NextResponse.json(
        { error: 'Request flagged by content guardrails.' },
        { status: 422 }
      );
    }

    // Transcript length guard
    if (transcript && transcript.length > 12000) {
      return NextResponse.json(
        { error: 'Transcript too long. Please upload a shorter presentation (< 10 min).' },
        { status: 422 }
      );
    }

    // Check & consume credit
    const { credits } = getCredits(cleanEmail);
    if (credits <= 0) {
      return NextResponse.json(
        { error: 'You have used all 5 trial credits. Contact us to unlock full access.' },
        { status: 429 }
      );
    }

    if (!consumeCredit(cleanEmail)) {
      return NextResponse.json(
        { error: 'No credits remaining.' },
        { status: 429 }
      );
    }

    const remainingAfter = getCredits(cleanEmail).credits;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 503 });
    }

    // ── Analyze: generate overview feedback ──────────────────────────────────
    if (action === 'analyze') {
      if (!transcript) {
        return NextResponse.json({ error: 'Transcript required.' }, { status: 400 });
      }

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are an expert academic presentation coach. Analyze this student presentation transcript and provide brief, constructive feedback.

TRANSCRIPT:
${transcript.slice(0, 6000)}

Return a JSON object:
{
  "overallScore": number (0-100),
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["area 1", "area 2", "area 3"],
  "delivery": { "score": number, "feedback": "1 sentence" },
  "content": { "score": number, "feedback": "1 sentence" },
  "structure": { "score": number, "feedback": "1 sentence" }
}

Respond ONLY with valid JSON.`
        }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
      const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return NextResponse.json({ result: parsed, creditsRemaining: remainingAfter });
    }

    // ── Questions: generate follow-up questions ───────────────────────────────
    if (action === 'questions') {
      if (!transcript) {
        return NextResponse.json({ error: 'Transcript required.' }, { status: 400 });
      }

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are an expert academic instructor. Generate 4 targeted follow-up questions for this student based on their presentation.

TRANSCRIPT:
${transcript.slice(0, 5000)}

Return a JSON array of question objects:
[
  { "question": "...", "category": "clarification" | "depth" | "evidence" | "application", "rationale": "why this question matters" }
]

Respond ONLY with valid JSON array.`
        }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
      const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return NextResponse.json({ result: parsed, creditsRemaining: remainingAfter });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('[/api/try]', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
