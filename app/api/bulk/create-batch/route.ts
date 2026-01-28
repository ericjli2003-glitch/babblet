export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBatch } from '@/lib/batch-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      courseName, 
      assignmentName, 
      // Legacy field names
      rubricCriteria, 
      rubricTemplateId,
      // New field names from wizard
      context,
      rubricId,
      customRubric,
      // Context references
      courseId,
      assignmentId,
      bundleVersionId,
      // ============================================
      // UPLOAD TRACKING: Expected file count from wizard
      // Stored in batch for persistent tracking across refreshes
      // ============================================
      expectedUploadCount,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Batch name is required' },
        { status: 400 }
      );
    }

    // Build rubric criteria string from custom rubric if provided
    let finalRubricCriteria = rubricCriteria || context;
    if (customRubric?.criteria) {
      finalRubricCriteria = customRubric.criteria
        .map((c: { name: string; description: string; points: number }) => 
          `${c.name} (${c.points} pts): ${c.description}`
        )
        .join('\n');
    }

    const batch = await createBatch({
      name,
      courseName,
      assignmentName,
      rubricCriteria: finalRubricCriteria,
      rubricTemplateId: rubricTemplateId || rubricId,
      // Pass context references if provided
      courseId,
      assignmentId: assignmentId,
      bundleVersionId,
      // Store expected upload count for persistent progress tracking
      expectedUploadCount: expectedUploadCount || undefined,
    });

    console.log(`[CreateBatch] Created batch ${batch.id} with bundleVersionId: ${bundleVersionId || 'none'}, expectedUploads: ${expectedUploadCount || 'none'}`);

    // Return batchId at top level for wizard compatibility
    return NextResponse.json({ success: true, batch, batchId: batch.id });
  } catch (error) {
    console.error('[CreateBatch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create batch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

