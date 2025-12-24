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
    const { courseId, name, instructions, dueDate, subjectArea, academicLevel } = body;

    if (!courseId || !name || !instructions) {
      return NextResponse.json(
        { error: 'courseId, name, and instructions are required' },
        { status: 400 }
      );
    }

    const assignment = await createAssignment({ 
      courseId, 
      name, 
      instructions, 
      dueDate,
      subjectArea, // e.g., "Microeconomics", "Public Speaking"
      academicLevel, // e.g., "Undergraduate", "Graduate"
    });
    console.log(`[Assignments] Created: ${assignment.id} - ${assignment.name} (${subjectArea || 'no subject'}, ${academicLevel || 'no level'})`);

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

// DELETE /api/context/assignments?id=xxx&cascade=true - Delete assignment with cascade
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('id');
    const cascade = searchParams.get('cascade') === 'true';

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });
    }

    // Track what was deleted for reporting
    const deleted = {
      assignment: false,
      batches: 0,
      submissions: 0,
      files: 0,
    };

    // If cascade, delete related batches and submissions first
    if (cascade) {
      const { kv } = await import('@vercel/kv');
      const { deleteFile, isR2Configured } = await import('@/lib/r2');
      
      // Find all batches for this assignment
      const batchIds = await kv.smembers('all_batches') || [];
      
      for (const batchId of batchIds) {
        const batch = await kv.get<{ assignmentId?: string }>(`batch:${batchId}`);
        if (batch?.assignmentId === assignmentId) {
          // Get submissions for this batch
          const submissionIds = await kv.smembers(`batch_submissions:${batchId}`) || [];
          
          for (const submissionId of submissionIds) {
            const submission = await kv.get<{ fileKey?: string }>(`submission:${submissionId}`);
            
            // Delete file from R2 if exists
            if (submission?.fileKey && isR2Configured()) {
              try {
                await deleteFile(submission.fileKey);
                deleted.files++;
              } catch (e) {
                console.error(`Failed to delete file ${submission.fileKey}:`, e);
              }
            }
            
            // Delete submission
            await kv.del(`submission:${submissionId}`);
            deleted.submissions++;
          }
          
          // Delete batch
          await kv.del(`batch_submissions:${batchId}`);
          await kv.del(`batch:${batchId}`);
          await kv.srem('all_batches', batchId);
          deleted.batches++;
        }
      }
      
      console.log(`[Assignments] Cascade deleted: ${deleted.batches} batches, ${deleted.submissions} submissions, ${deleted.files} files`);
    }

    // Delete the assignment itself (this also deletes bundle versions, rubrics, documents via context-store)
    await deleteAssignment(assignmentId);
    deleted.assignment = true;
    
    console.log(`[Assignments] Deleted assignment: ${assignmentId}`);

    return NextResponse.json({ 
      success: true,
      deleted,
    });
  } catch (error) {
    console.error('[Assignments] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete assignment', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

