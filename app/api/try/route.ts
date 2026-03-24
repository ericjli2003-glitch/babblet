import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
      const branchPrompt = `You are Babblet, an academic presentation coach. Given a follow-up question that was already asked about a student presentation, generate exactly ${n} deeper follow-up question${n > 1 ? 's' : ''} that branch from it — more specific, still grounded in the transcript.

PARENT QUESTION:
${pq.slice(0, 2000)}

PARENT CATEGORY (optional): ${parentCategory || 'general'}

${focus ? `USER PRIORITIES (honor these in all questions — tone, angle, or subtopics):\n${focus}\n\n` : ''}TRANSCRIPT (excerpt):
${tx.slice(0, 6000)}

Return ONLY valid JSON with exactly ${n} item${n > 1 ? 's' : ''} in the branches array:
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

      const prompt = `You are Babblet. Analyze this student presentation transcript and return a comprehensive evaluation in JSON.

TRANSCRIPT:
${transcript.slice(0, 9000)}

First, split the transcript into 10–18 chronological segments for reference. Index them 0,1,2,... in the "transcript" array below. Each segment should be a natural phrase or sentence block (not one giant string).

Return ONLY valid JSON with this exact shape:
{
  "overallScore": <number 0-100>,
  "maxScore": 100,
  "letterGrade": <"A"|"A-"|"B+"|"B"|"B-"|"C+"|"C"|"D"|"F">,
  "summary": "<2-3 sentence overall assessment>",
  "speechMetrics": { "fillerWords": <estimate 0-40>, "wordsPerMin": <estimate 90-200>, "pausesPerMin": <estimate 1-15> },
  "strengths": [
    { "text": "<observation>", "quote": "<verbatim short excerpt from transcript segments that supports this, 15-35 words>" },
    { "text": "<observation>", "quote": "<verbatim short excerpt>" },
    { "text": "<observation>", "quote": "<verbatim short excerpt>" }
  ],
  "improvements": [
    { "text": "<observation>", "quote": "<verbatim short excerpt that shows the gap, 15-35 words>" },
    { "text": "<observation>", "quote": "<verbatim short excerpt>" },
    { "text": "<observation>", "quote": "<verbatim short excerpt>" }
  ],
  "transcript": [
    { "timestamp": "<M:SS or best guess>", "text": "<segment text — must match wording in TRANSCRIPT above>" },
    { "timestamp": "...", "text": "..." }
  ],
  "rubric": [
    {
      "criterion": "Content & Knowledge",
      "score": <0-25>,
      "maxScore": 25,
      "feedback": "<1-2 sentences>",
      "status": <"strong"|"adequate"|"weak">,
      "insights": {
        "overview": "<2-4 sentences: how this criterion was met vs rubric expectations>",
        "strengths": [
          { "text": "<specific strength tied to the presentation>", "refs": [<segment indices e.g. 0,2>] }
        ],
        "improvements": [
          { "text": "<specific gap or next step>", "refs": [<segment indices>] }
        ]
      }
    },
    {
      "criterion": "Structure & Organization",
      "score": <0-25>,
      "maxScore": 25,
      "feedback": "<1-2 sentences>",
      "status": <"strong"|"adequate"|"weak">,
      "insights": { "overview": "...", "strengths": [...], "improvements": [...] }
    },
    {
      "criterion": "Evidence & Support",
      "score": <0-25>,
      "maxScore": 25,
      "feedback": "<1-2 sentences>",
      "status": <"strong"|"adequate"|"weak">,
      "insights": { "overview": "...", "strengths": [...], "improvements": [...] }
    },
    {
      "criterion": "Clarity & Delivery",
      "score": <0-25>,
      "maxScore": 25,
      "feedback": "<1-2 sentences>",
      "status": <"strong"|"adequate"|"weak">,
      "insights": { "overview": "...", "strengths": [...], "improvements": [...] }
    }
  ],
  "questions": [
    { "question": "<targeted follow-up question>", "category": <"clarification"|"depth"|"evidence"|"application"|"assumption"|"synthesis">, "rationale": "<why this question matters, 1 sentence>", "timestamp": "<approximate timestamp like '1:45' or '' if unknown>" },
    { "question": "<question>", "category": "<category>", "rationale": "<rationale>", "timestamp": "<timestamp>" },
    { "question": "<question>", "category": "<category>", "rationale": "<rationale>", "timestamp": "<timestamp>" },
    { "question": "<question>", "category": "<category>", "rationale": "<rationale>", "timestamp": "<timestamp>" },
    { "question": "<question>", "category": "<category>", "rationale": "<rationale>", "timestamp": "<timestamp>" }
  ]
}

Rules:
- "transcript" segments must be copied from the source TRANSCRIPT (verbatim splits). refs in insights use indices into this same "transcript" array (0-based).
- quotes in strengths/improvements must be verbatim from those segments.
- Every rubric row MUST include a complete "insights" object with overview, at least 2 strengths items, and at least 2 improvements items.
- rubric scores must sum to overallScore
- Respond ONLY with the JSON object, no commentary`;

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
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
