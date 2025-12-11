import { NextRequest } from 'next/server';
import { getSession, addConnection, removeConnection } from '@/lib/session-store';

// GET - Server-Sent Events stream for real-time updates
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('Session ID required', { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response('Session not found', { status: 404 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register connection
      addConnection(sessionId, controller);

      // Send initial state
      const initMessage = JSON.stringify({
        type: 'init',
        data: {
          sessionId,
          status: session.status,
          transcript: session.transcript,
          questions: session.questions,
          analysis: session.analysis,
          rubric: session.rubric,
        },
        timestamp: Date.now(),
        sessionId,
      });
      controller.enqueue(new TextEncoder().encode(`data: ${initMessage}\n\n`));

      // Heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = JSON.stringify({
            type: 'heartbeat',
            timestamp: Date.now(),
            sessionId,
          });
          controller.enqueue(new TextEncoder().encode(`data: ${heartbeat}\n\n`));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        removeConnection(sessionId, controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

