import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { isClaudeConfigured } from '@/lib/claude';
import type { VerificationFinding } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, claims } = body as { transcript?: string; claims?: string[] };

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
    }

    // If no Claude configured, return lightweight heuristic findings
    if (!isClaudeConfigured()) {
      const findings: VerificationFinding[] = (claims || []).slice(0, 5).map((c) => ({
        id: uuidv4(),
        statement: c,
        verdict: 'uncertain',
        confidence: 0.5,
        explanation: 'Configure ANTHROPIC_API_KEY to enable AI verification.',
        whatToVerify: 'Check authoritative sources relevant to this statement.',
      }));
      return NextResponse.json({ findings });
    }

    // Lazy import to avoid circular dependency during build
    const { verifyWithClaude } = await import('@/lib/verify');
    const findings = await verifyWithClaude(transcript, claims);

    return NextResponse.json({ findings });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to verify', details: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


