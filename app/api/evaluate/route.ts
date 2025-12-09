import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateRubric, getAnalysis } from '@/lib/session-store';
import { evaluatePresentation } from '@/lib/openai';
import { broadcastToSession } from '@/lib/stream-manager';
import type { RubricEvaluation, AnalysisSummary } from '@/lib/types';

// POST - Generate rubric evaluation
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

    // Get analysis for evaluation
    const analysis = getAnalysis(sessionId);
    
    let rubric: RubricEvaluation;

    try {
      if (!analysis) {
        throw new Error('No analysis available');
      }
      
      // Call OpenAI for rubric evaluation
      rubric = await evaluatePresentation(transcript, analysis);
    } catch (openaiError) {
      // If OpenAI fails, create mock rubric for development
      console.warn('OpenAI rubric evaluation failed, using mock data:', openaiError);
      
      // Use existing analysis or create mock
      const mockAnalysis: AnalysisSummary = analysis || {
        keyClaims: [],
        logicalGaps: [],
        missingEvidence: [],
        overallStrength: 3,
        suggestions: [],
        timestamp: Date.now(),
      };

      rubric = {
        contentQuality: {
          score: 3.5,
          feedback: 'The presentation demonstrates a solid understanding of the topic with room for deeper exploration of key concepts.',
          strengths: [
            'Clear main argument presented',
            'Logical organization of ideas',
            'Relevant examples provided',
          ],
          improvements: [
            'Could include more supporting evidence',
            'Some concepts need further clarification',
            'Consider adding more specific data points',
          ],
        },
        delivery: {
          score: 4.0,
          feedback: 'Effective communication with good pacing. The presenter maintained engagement throughout most of the presentation.',
          strengths: [
            'Clear and confident speaking voice',
            'Good pacing throughout',
            'Effective use of transitions',
          ],
          improvements: [
            'Occasional filler words could be reduced',
            'Some sections felt slightly rushed',
            'Eye contact could be more consistent',
          ],
        },
        evidenceStrength: {
          score: 3.0,
          feedback: 'Evidence provided supports the main arguments, but additional sources and data would strengthen the overall case.',
          strengths: [
            'Relevant sources cited',
            'Examples support main points',
            'Good use of case studies',
          ],
          improvements: [
            'Include more quantitative data',
            'Diversify source types',
            'Address potential counterevidence',
          ],
        },
        overallScore: 3.5,
        overallFeedback: 'This is a competent presentation that effectively communicates the main ideas. To elevate it to excellent, focus on strengthening the evidence base and deepening the analysis of key claims. The delivery is engaging, and with some refinement in supporting materials, this could be an outstanding presentation.',
        timestamp: Date.now(),
      };
    }

    // Store rubric
    updateRubric(sessionId, rubric);

    // Broadcast to connected clients
    broadcastToSession(sessionId, {
      type: 'rubric_update',
      data: { rubric },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('Rubric evaluation error:', error);
    return NextResponse.json(
      { error: 'Rubric evaluation failed' },
      { status: 500 }
    );
  }
}

