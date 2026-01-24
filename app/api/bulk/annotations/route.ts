import { NextRequest, NextResponse } from 'next/server';
import { getSubmission, updateSubmission } from '@/lib/batch-store';
import { v4 as uuidv4 } from 'uuid';

// GET /api/bulk/annotations?submissionId=xxx - Get annotations for a submission
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get('submissionId');

  if (!submissionId) {
    return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    annotations: submission.annotations || {
      flaggedSegments: [],
      comments: [],
      isGraded: false,
    },
  });
}

// POST /api/bulk/annotations - Add a flag or comment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submissionId, type, segmentIndex, timestamp, text, reason } = body;

    if (!submissionId || !type) {
      return NextResponse.json({ error: 'submissionId and type are required' }, { status: 400 });
    }

    const submission = await getSubmission(submissionId);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const annotations = submission.annotations || {
      flaggedSegments: [],
      comments: [],
      isGraded: false,
    };

    if (type === 'flag') {
      // Add flag
      const newFlag = {
        id: uuidv4(),
        segmentIndex,
        timestamp,
        reason,
        createdAt: Date.now(),
      };
      annotations.flaggedSegments.push(newFlag);

      await updateSubmission(submissionId, { annotations });

      return NextResponse.json({ success: true, flag: newFlag, annotations });
    } else if (type === 'comment') {
      // Add comment
      if (!text?.trim()) {
        return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
      }

      const newComment = {
        id: uuidv4(),
        segmentIndex,
        timestamp,
        text: text.trim(),
        createdAt: Date.now(),
      };
      annotations.comments.push(newComment);

      await updateSubmission(submissionId, { annotations });

      return NextResponse.json({ success: true, comment: newComment, annotations });
    } else if (type === 'mark_graded') {
      // Mark as graded
      annotations.isGraded = true;
      annotations.gradedAt = Date.now();

      await updateSubmission(submissionId, { annotations });

      return NextResponse.json({ success: true, annotations });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('[Annotations POST] Error:', error);
    return NextResponse.json({ error: 'Failed to add annotation' }, { status: 500 });
  }
}

// DELETE /api/bulk/annotations - Remove a flag or comment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submissionId');
    const type = searchParams.get('type'); // 'flag' or 'comment'
    const annotationId = searchParams.get('id');

    if (!submissionId || !type || !annotationId) {
      return NextResponse.json({ error: 'submissionId, type, and id are required' }, { status: 400 });
    }

    const submission = await getSubmission(submissionId);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const annotations = submission.annotations || {
      flaggedSegments: [],
      comments: [],
      isGraded: false,
    };

    if (type === 'flag') {
      annotations.flaggedSegments = annotations.flaggedSegments.filter(f => f.id !== annotationId);
    } else if (type === 'comment') {
      annotations.comments = annotations.comments.filter(c => c.id !== annotationId);
    } else if (type === 'graded') {
      annotations.isGraded = false;
      annotations.gradedAt = undefined;
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    await updateSubmission(submissionId, { annotations });

    return NextResponse.json({ success: true, annotations });
  } catch (error) {
    console.error('[Annotations DELETE] Error:', error);
    return NextResponse.json({ error: 'Failed to delete annotation' }, { status: 500 });
  }
}
