export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBatch } from '@/lib/batch-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, courseName, assignmentName, rubricCriteria, rubricTemplateId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Batch name is required' },
        { status: 400 }
      );
    }

    const batch = await createBatch({
      name,
      courseName,
      assignmentName,
      rubricCriteria,
      rubricTemplateId,
    });

    return NextResponse.json({ success: true, batch });
  } catch (error) {
    console.error('[CreateBatch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create batch', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

