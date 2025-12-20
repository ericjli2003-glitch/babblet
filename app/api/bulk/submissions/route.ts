export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSubmission, updateSubmission } from '@/lib/batch-store';

// GET /api/bulk/submissions?id=xxx - Get full submission details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('id');

    if (!submissionId) {
      return NextResponse.json({ error: 'Submission ID required' }, { status: 400 });
    }

    const submission = await getSubmission(submissionId);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, submission });
  } catch (error) {
    console.error('[GetSubmission] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submission', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH /api/bulk/submissions - Update submission (e.g., student name)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { submissionId, studentName, studentId } = body;

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    const updates: { studentName?: string; studentId?: string } = {};
    if (studentName !== undefined) updates.studentName = studentName;
    if (studentId !== undefined) updates.studentId = studentId;

    const updated = await updateSubmission(submissionId, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, submission: updated });
  } catch (error) {
    console.error('[UpdateSubmission] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update submission', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

