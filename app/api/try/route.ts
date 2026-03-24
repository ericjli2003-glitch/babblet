import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Tell Vercel/Next.js this route can run up to 60 seconds
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── In-memory rate store ─────────────────────────────────────────────────────
const CREDIT_STORE = new Map<string, { credits: number; resetAt: number }>();
const MAX_CREDITS = 9;
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

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return null;
  }
}

// ─── POST /api/try ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, transcript, parentQuestion, parentCategory, userInstruction, branchCount } = body as {
      action: 'full' | 'credits' | 'branch';
      email: string;
      transcript?: string;
      parentQuestion?: string;
      parentCategory?: string;
      userInstruction?: string;
      branchCount?: number;
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });
    }
    const cleanEmail = email.toLowerCase().trim();

    if (action === 'credits') {
      const { credits } = getCredits(cleanEmail);
      return NextResponse.json({ credits, max: MAX_CREDITS });
    }

    const combined = [transcript, userInstruction].filter(Boolean).join('\n');
    if (detectMisuse(combined)) {
      return NextResponse.json({ error: 'Request flagged by content guardrails.' }, { status: 422 });
    }
    if (transcript && transcript.length > 14000) {
      return NextResponse.json(
        { error: 'Transcript too long. Please upload a shorter presentation (< 12 min).' },
        { status: 422 }
      );
    }

    if (action === 'branch') {
      if (!parentQuestion || typeof parentQuestion !== 'string') {
        return NextResponse.json({ error: 'Parent question required.' }, { status: 400 });
      }
      if (!transcript || transcript.length < 20) {
        return NextResponse.json({ error: 'Transcript required for branching.' }, { status: 400 });
      }
    }

    // Credits handled client-side for trial; server still gates via email
    const { credits } = getCredits(cleanEmail);
    if (credits <= 0) {
      return NextResponse.json(
        { error: 'You have used all trial credits. Please sign up for full access.' },
        { status: 429 }
      );
    }
    consumeCredit(cleanEmail);
    const remainingAfter = getCredits(cleanEmail).credits;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Babblet analysis is not configured on this server.' }, { status: 503 });
    }

    if (action === 'branch') {
      const pq = parentQuestion as string;
      const tx = transcript as string;
      const n = Math.min(Math.max(1, branchCount ?? 1), 3);
      const focus =
        typeof userInstruction === 'string' && userInstruction.trim()
          ? userInstruction.trim().slice(0, 1400)
          : '';
      const exampleItems = Array.from({ length: n }, (_, i) =>
        `    { "question": "...", "category": "clarification"|"depth"|"evidence"|"application"|"assumption"|"synthesis", "rationale": "one sentence", "timestamp": "M:SS or empty" }${i < n - 1 ? ',' : ''}`
      ).join('\n');
      const categoryDescriptions: Record<string, string> = {
        clarification: 'Clarification — ask the student to explain or define something they said more precisely',
        depth: 'Depth — probe the underlying reasoning, mechanisms, or implications behind their claim',
        evidence: 'Evidence Request — challenge them to cite specific research, data, or examples supporting their statement',
        application: 'Application — ask how they would apply the concept to a different scenario or constraint',
        assumption: 'Assumption Challenge — surface and question an unstated assumption embedded in their answer',
        synthesis: 'Synthesis — ask them to connect two ideas or reconcile a tension in their argument',
      };
      const catKey = (parentCategory || '').toLowerCase();
      const catDesc = categoryDescriptions[catKey] ?? `${parentCategory || 'general'} — stay consistent with the cognitive demand of the parent question`;

      const branchPrompt = `You are Babblet, an academic presentation coach. Given a follow-up question that was already asked about a student presentation, generate exactly ${n} deeper follow-up question${n > 1 ? 's' : ''} that branch from it.

IMPORTANT: Every generated question MUST be of the same cognitive category as the parent:
Category: ${catDesc}
Do NOT switch to a different category. The questions should go deeper within this same category.

PARENT QUESTION:
${pq.slice(0, 2000)}

${focus ? `USER PRIORITIES (honor these in all questions — tone, angle, or subtopics):\n${focus}\n\n` : ''}TRANSCRIPT (excerpt):
${tx.slice(0, 6000)}

Return ONLY valid JSON with exactly ${n} item${n > 1 ? 's' : ''} in the branches array. Set "category" to "${catKey || 'depth'}" for every item:
{
  "branches": [
${exampleItems}
  ]
}`;

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1100,
        messages: [{ role: 'user', content: branchPrompt }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
      const parsed = safeParseJson(raw) as { branches?: unknown } | null;
      const branches = parsed && Array.isArray(parsed.branches) ? parsed.branches : null;
      if (!branches || branches.length === 0) {
        return NextResponse.json({ error: 'Could not generate branch questions.' }, { status: 500 });
      }

      return NextResponse.json({ branches, creditsRemaining: remainingAfter });
    }

    if (action === 'full') {
      if (!transcript) return NextResponse.json({ error: 'Transcript required.' }, { status: 400 });

      // For stub/trial uploads (no real transcript), send a minimal prompt.
      // The client's ensureTrialResult fills rubric insights + transcript segments from demo data.
      const isStub = transcript.length < 400;
      const context = isStub
        ? `A student uploaded a video presentation (filename hint: "${transcript.slice(0, 120)}"). No transcript is available. Generate a plausible academic presentation evaluation.`
        : `TRANSCRIPT:\n${transcript.slice(0, 6000)}`;

      const prompt = `You are Babblet, an academic presentation coach. Return ONLY a valid JSON object — no markdown, no commentary.

${context}

JSON shape (keep every string field to 1 sentence max):
{"overallScore":<0-100>,"maxScore":100,"letterGrade":"B+","summary":"<1-2 sentences>","strengths":[{"text":"<observation>","quote":"<10-20 word excerpt>"},{"text":"<observation>","quote":"<excerpt>"},{"text":"<observation>","quote":"<excerpt>"}],"improvements":[{"text":"<observation>","quote":"<10-20 word excerpt>"},{"text":"<observation>","quote":"<excerpt>"},{"text":"<observation>","quote":"<excerpt>"}],"rubric":[{"criterion":"Content & Knowledge","score":<0-25>,"maxScore":25,"feedback":"<1 sentence>","status":"strong"},{"criterion":"Structure & Organization","score":<0-25>,"maxScore":25,"feedback":"<1 sentence>","status":"adequate"},{"criterion":"Evidence & Support","score":<0-25>,"maxScore":25,"feedback":"<1 sentence>","status":"adequate"},{"criterion":"Clarity & Delivery","score":<0-25>,"maxScore":25,"feedback":"<1 sentence>","status":"strong"}],"questions":[{"question":"<question>","category":"evidence","rationale":"<1 sentence>","timestamp":"1:00"},{"question":"<question>","category":"depth","rationale":"<1 sentence>","timestamp":"1:20"},{"question":"<question>","category":"application","rationale":"<1 sentence>","timestamp":"1:40"},{"question":"<question>","category":"assumption","rationale":"<1 sentence>","timestamp":"2:00"},{"question":"<question>","category":"synthesis","rationale":"<1 sentence>","timestamp":"0:40"}]}

Rules: rubric scores must sum to overallScore. Return ONLY the JSON.`;

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
      const parsed = safeParseJson(raw);
      if (!parsed) return NextResponse.json({ error: 'Failed to parse Babblet response.' }, { status: 500 });

      return NextResponse.json({ result: parsed, creditsRemaining: remainingAfter });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('[/api/try]', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
