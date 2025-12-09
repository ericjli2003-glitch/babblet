import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session-store';

// Store active connections for broadcasting
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

// Helper to broadcast events to all connected clients for a session
export function broadcastToSession(sessionId: string, event: {
  type: string;
  data: unknown;
  timestamp: number;
}) {
  const sessionConnections = connections.get(sessionId);
  if (sessionConnections) {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    sessionConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch (e) {
        // Connection closed, will be cleaned up
        console.error('Failed to send to connection:', e);
      }
    });
  }
}

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
      if (!connections.has(sessionId)) {
        connections.set(sessionId, new Set());
      }
      connections.get(sessionId)!.add(controller);

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
        const sessionConnections = connections.get(sessionId);
        if (sessionConnections) {
          sessionConnections.delete(controller);
          if (sessionConnections.size === 0) {
            connections.delete(sessionId);
          }
        }
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

