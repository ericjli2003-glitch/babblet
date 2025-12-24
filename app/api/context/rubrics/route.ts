export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  createRubric, 
  getRubric, 
  updateRubric,
  type RubricCriterion,
  type GradingScale,
} from '@/lib/context-store';

// GET /api/context/rubrics?id=xxx - Get rubric
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rubricId = searchParams.get('id');

    if (!rubricId) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const rubric = await getRubric(rubricId);
    if (!rubric) {
      return NextResponse.json({ error: 'Rubric not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('[Rubrics] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rubric', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/context/rubrics - Create new rubric
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      courseId, 
      assignmentId, 
      name, 
      criteria, 
      rawText,
      sourceType,
      overallConfidence,
      totalPoints,
      gradingScale,
    } = body;

    if (!courseId || !name || !criteria) {
      return NextResponse.json(
        { error: 'courseId, name, and criteria are required' },
        { status: 400 }
      );
    }

    // Validate criteria structure
    const validCriteria: RubricCriterion[] = criteria.map((c: Partial<RubricCriterion>, i: number) => ({
      id: c.id || `criterion-${i + 1}`,
      name: c.name || `Criterion ${i + 1}`,
      description: c.description || '',
      weight: c.weight || 1,
      levels: c.levels,
      requiredEvidenceTypes: c.requiredEvidenceTypes,
      confidence: c.confidence,
      originalText: c.originalText,
    }));

    // Validate grading scale if provided
    let validGradingScale: GradingScale | undefined;
    if (gradingScale) {
      const validTypes = ['points', 'percentage', 'letter', 'bands', 'none'] as const;
      validGradingScale = {
        type: validTypes.includes(gradingScale.type) ? gradingScale.type : 'none',
        maxScore: gradingScale.maxScore || totalPoints,
        letterGrades: gradingScale.letterGrades,
        bands: gradingScale.bands,
      };
    }

    const rubric = await createRubric({ 
      courseId, 
      assignmentId, 
      name, 
      criteria: validCriteria, 
      rawText,
      sourceType,
      overallConfidence,
      totalPoints,
      gradingScale: validGradingScale,
    });
    
    console.log(`[Rubrics] Created: ${rubric.id} - ${rubric.name} (${validCriteria.length} criteria, source: ${sourceType || 'unknown'}, scale: ${validGradingScale?.type || 'none'})`);

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('[Rubrics] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create rubric', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// PATCH /api/context/rubrics - Update rubric
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { rubricId, ...updates } = body;

    if (!rubricId) {
      return NextResponse.json({ error: 'rubricId is required' }, { status: 400 });
    }

    const rubric = await updateRubric(rubricId, updates);
    if (!rubric) {
      return NextResponse.json({ error: 'Rubric not found' }, { status: 404 });
    }

    console.log(`[Rubrics] Updated: ${rubric.id} - now v${rubric.version}`);

    return NextResponse.json({ success: true, rubric });
  } catch (error) {
    console.error('[Rubrics] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update rubric', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

