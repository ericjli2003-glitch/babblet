import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session-store';
import { addConnection, removeConnection } from '@/lib/stream-manager';

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

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Register this connection
      addConnection(sessionId, controller);

      // Send initial connection message
      const initMessage = JSON.stringify({
        type: 'session_start',
        data: {
          sessionId,
          status: session.status,
          transcript: session.transcript,
          analysis: session.analysis,
          questions: session.questions,
          rubric: session.rubric,
        },
        timestamp: Date.now(),
        sessionId,
      });
      controller.enqueue(new TextEncoder().encode(`data: ${initMessage}\n\n`));

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          );
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
