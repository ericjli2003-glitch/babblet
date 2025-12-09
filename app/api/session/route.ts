import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, updateSessionStatus, deleteSession } from '@/lib/session-store';

// POST - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, presenterName } = body;

    const session = createSession({
      title: title || 'Untitled Presentation',
      presenterName,
    });

    // Update status based on mode
    updateSessionStatus(session.id, type === 'live' ? 'idle' : 'processing');

    return NextResponse.json({
      sessionId: session.id,
      status: 'ready',
      message: `Session created successfully. Mode: ${type}`,
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
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}

