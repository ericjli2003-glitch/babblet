export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  createCourse, 
  getCourse, 
  updateCourse, 
  getAllCourses, 
  deleteCourse 
} from '@/lib/context-store';

// GET /api/context/courses - List all courses
// GET /api/context/courses?id=xxx - Get single course
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('id');

    if (courseId) {
      const course = await getCourse(courseId);
      if (!course) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, course });
    }

    const courses = await getAllCourses();
    return NextResponse.json({ success: true, courses });
  } catch (error) {
    console.error('[Courses] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch courses', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/context/courses - Create new course
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, courseCode, term, description } = body;

    if (!name || !courseCode || !term) {
      return NextResponse.json(
        { error: 'name, courseCode, and term are required' },
        { status: 400 }
      );
    }

    const course = await createCourse({ name, courseCode, term, description });
    console.log(`[Courses] Created: ${course.id} - ${course.name}`);

    return NextResponse.json({ success: true, course });
  } catch (error) {
    console.error('[Courses] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create course', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// PATCH /api/context/courses?id=xxx - Update course
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseIdFromQuery = searchParams.get('id');
    
    const body = await request.json();
    const { courseId: courseIdFromBody, ...updates } = body;
    
    // Accept courseId from either query string or body
    const courseId = courseIdFromQuery || courseIdFromBody;

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required (via ?id=xxx or in body)' }, { status: 400 });
    }

    const course = await updateCourse(courseId, updates);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    console.log(`[Courses] Updated: ${courseId} - summary=${!!updates.summary}, keyThemes=${!!updates.keyThemes}`);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    console.error('[Courses] PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update course', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// DELETE /api/context/courses?id=xxx - Delete course
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('id');

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID required' }, { status: 400 });
    }

    await deleteCourse(courseId);
    console.log(`[Courses] Deleted: ${courseId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Courses] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete course', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

