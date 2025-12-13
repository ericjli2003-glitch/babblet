import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, getFullTranscript, setAnalysis, broadcastToSession } from '@/lib/session-store';
import { detectSemanticEvents, isGeminiConfigured } from '@/lib/gemini';
import { analyzeWithClaude, isClaudeConfigured } from '@/lib/claude';
import { broadcastAnalysis } from '@/lib/pusher';
import type { AnalysisSummary, KeyClaim, LogicalGap, MissingEvidence } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, transcript: providedTranscript } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Use provided transcript or try to get from session (may not work on serverless)
    let transcript = providedTranscript;
    if (!transcript) {
      const session = getSession(sessionId);
      if (session) {
        transcript = getFullTranscript(sessionId);
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for analysis' },
        { status: 400 }
      );
    }

    console.log(`[Analyze] Processing transcript: ${transcript.slice(0, 100)}...`);

    // Use Claude for analysis (preferred), fall back to Gemini, then mock
    let analysis: AnalysisSummary;

    if (isClaudeConfigured()) {
      console.log('[Analyze] Using Claude Sonnet 4 for analysis...');
      analysis = await analyzeWithClaude(transcript);
      console.log('[Analyze] Claude analysis complete');
    } else if (isGeminiConfigured()) {
      console.log('[Analyze] Using Gemini for analysis...');
      const events = await detectSemanticEvents(transcript);

      // Convert semantic events to claims, gaps, etc.
      const keyClaims: KeyClaim[] = events
        .filter(e => e.type === 'claim' || e.type === 'argument')
        .map(e => ({
          id: e.id,
          claim: e.content,
          evidence: [],
          timestamp: e.timestamp,
          confidence: e.confidence,
        }));

      const logicalGaps: LogicalGap[] = events
        .filter(e => e.type === 'unclear')
        .map(e => ({
          id: e.id,
          description: e.content,
          severity: 'moderate' as const,
          suggestion: 'Consider clarifying this point',
        }));

      const missingEvidence: MissingEvidence[] = keyClaims
        .filter(c => c.evidence.length === 0)
        .slice(0, 3)
        .map(c => ({
          id: uuidv4(),
          description: `Supporting evidence needed for: ${c.claim.slice(0, 50)}...`,
          relatedClaim: c.claim,
          importance: 'medium' as const,
        }));

      analysis = {
        keyClaims,
        logicalGaps,
        missingEvidence,
        overallStrength: Math.min(5, Math.max(1, keyClaims.length * 0.5 + 2)),
        suggestions: [
          'Continue developing your main arguments',
          'Consider adding more supporting evidence',
        ],
        timestamp: Date.now(),
      };
    } else {
      // Mock analysis if no LLM configured
      console.log('[Analyze] No LLM configured, returning mock analysis');
      analysis = {
        keyClaims: [{
          id: uuidv4(),
          claim: 'Add ANTHROPIC_API_KEY or GEMINI_API_KEY for real analysis',
          evidence: [],
          confidence: 0.5,
        }],
        logicalGaps: [],
        missingEvidence: [],
        overallStrength: 2.5,
        suggestions: ['Configure an LLM API key in Vercel environment variables'],
        timestamp: Date.now(),
      };
    }

    setAnalysis(sessionId, analysis);

    // Broadcast to connected clients via SSE (legacy)
    broadcastToSession(sessionId, {
      type: 'analysis_update',
      data: { summary: analysis },
      timestamp: Date.now(),
      sessionId,
    });

    // Broadcast via Pusher for real-time multi-user support
    await broadcastAnalysis(sessionId, analysis);

    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze content' },
      { status: 500 }
    );
  }
}

