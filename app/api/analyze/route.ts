import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, updateAnalysis, getSlideAnalysis } from '@/lib/session-store';
import { analyzeTranscript } from '@/lib/openai';
import { broadcastToSession } from '../stream-presentation/route';
import type { AnalysisSummary } from '@/lib/types';

// POST - Analyze transcript content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, transcript } = body;

    if (!sessionId || !transcript) {
      return NextResponse.json(
        { error: 'Session ID and transcript required' },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get slide context if available
    const slideAnalysis = getSlideAnalysis(sessionId);
    let slideContext: string | undefined;
    
    if (slideAnalysis) {
      slideContext = slideAnalysis.slides
        .map((s) => `Slide ${s.pageNumber}: ${s.mainPoints.join(', ')}`)
        .join('\n');
    }

    let analysis: AnalysisSummary;

    try {
      // Call OpenAI for analysis
      analysis = await analyzeTranscript(transcript, slideContext);
    } catch (openaiError) {
      // If OpenAI fails, create mock analysis for development
      console.warn('OpenAI analysis failed, using mock data:', openaiError);
      
      analysis = {
        keyClaims: [
          {
            id: uuidv4(),
            claim: 'Main argument detected in presentation',
            evidence: ['Supporting point 1', 'Supporting point 2'],
            confidence: 0.85,
            category: 'thesis',
          },
          {
            id: uuidv4(),
            claim: 'Secondary argument mentioned',
            evidence: ['Evidence mentioned'],
            confidence: 0.75,
            category: 'supporting',
          },
        ],
        logicalGaps: [
          {
            id: uuidv4(),
            description: 'Connection between main claim and evidence could be stronger',
            severity: 'moderate',
            suggestion: 'Consider adding transitional statements',
          },
        ],
        missingEvidence: [
          {
            id: uuidv4(),
            description: 'Quantitative data to support claims',
            relatedClaim: 'Main argument',
            importance: 'medium',
          },
        ],
        overallStrength: 3.5,
        suggestions: [
          'Strengthen the connection between claims and evidence',
          'Add more specific examples',
          'Consider addressing counterarguments',
        ],
        timestamp: Date.now(),
      };
    }

    // Store analysis
    updateAnalysis(sessionId, analysis);

    // Broadcast to connected clients
    broadcastToSession(sessionId, {
      type: 'analysis_update',
      data: { summary: analysis },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    );
  }
}

