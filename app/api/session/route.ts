import { NextRequest, NextResponse } from 'next/server';
import { 
  createSession, 
  getSession, 
  updateSessionStatus, 
  deleteSession 
} from '@/lib/session-store';

// POST - Create a new session
export async function POST() {
  try {
    const session = createSession();
    
    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      message: 'Session created successfully',
    });
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

// GET - Get session details
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
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

    return NextResponse.json(session);
  } catch (error) {
    console.error('Session retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session' },
      { status: 500 }
    );
  }
}

// PATCH - Update session status
export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, status } = await request.json();
    
    if (!sessionId || !status) {
      return NextResponse.json(
        { error: 'Session ID and status required' },
        { status: 400 }
      );
    }

    const session = updateSessionStatus(sessionId, status);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, status: session.status });
  } catch (error) {
    console.error('Session update error:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a session
export async function DELETE(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const deleted = deleteSession(sessionId);
    
    return NextResponse.json({ success: deleted });
  } catch (error) {
    console.error('Session deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
