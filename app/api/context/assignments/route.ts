export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  createAssignment, 
  getAssignment, 
  updateAssignment, 
  getCourseAssignments,
  deleteAssignment,
  getOrCreateAssignmentBundle,
  getLatestBundleVersion,
} from '@/lib/context-store';

// GET /api/context/assignments?courseId=xxx - List assignments for course
// GET /api/context/assignments?id=xxx - Get single assignment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('id');
    const courseId = searchParams.get('courseId');

    if (assignmentId) {
      const assignment = await getAssignment(assignmentId);
      if (!assignment) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }
      
      // Also get the bundle and latest version if exists
      const bundle = await getOrCreateAssignmentBundle(assignmentId);
      const latestVersion = bundle ? await getLatestBundleVersion(bundle.id) : null;
      
      return NextResponse.json({ 
        success: true, 
        assignment,
        bundle,
        latestVersion,
      });
    }

    if (courseId) {
      const assignments = await getCourseAssignments(courseId);
      return NextResponse.json({ success: true, assignments });
    }

    return NextResponse.json({ error: 'courseId or id required' }, { status: 400 });
  } catch (error) {
    console.error('[Assignments] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignments', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/context/assignments - Create new assignment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courseId, name, instructions, dueDate } = body;

    if (!courseId || !name || !instructions) {
      return NextResponse.json(
        { error: 'courseId, name, and instructions are required' },
        { status: 400 }
      );
    }

    const assignment = await createAssignment({ courseId, name, instructions, dueDate });
    console.log(`[Assignments] Created: ${assignment.id} - ${assignment.name}`);

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error('[Assignments] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create assignment', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// PATCH /api/context/assignments - Update assignment
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { assignmentId, ...updates } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 });
    }

    const assignment = await updateAssignment(assignmentId, updates);
    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error('[Assignments] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update assignment', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// DELETE /api/context/assignments?id=xxx - Delete assignment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('id');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });
    }

    await deleteAssignment(assignmentId);
    console.log(`[Assignments] Deleted: ${assignmentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Assignments] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete assignment', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

