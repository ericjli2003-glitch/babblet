// ============================================
// Stream Manager for SSE Broadcasting
// ============================================

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

// Add a connection to a session
export function addConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  if (!connections.has(sessionId)) {
    connections.set(sessionId, new Set());
  }
  connections.get(sessionId)!.add(controller);
}

// Remove a connection from a session
export function removeConnection(sessionId: string, controller: ReadableStreamDefaultController) {
  const sessionConnections = connections.get(sessionId);
  if (sessionConnections) {
    sessionConnections.delete(controller);
    if (sessionConnections.size === 0) {
      connections.delete(sessionId);
    }
  }
}

// Get connection count for a session
export function getConnectionCount(sessionId: string): number {
  return connections.get(sessionId)?.size || 0;
}

