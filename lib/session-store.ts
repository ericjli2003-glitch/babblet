// ============================================
// Session Store for Babblet v2
// In-memory session management
// ============================================

import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  TranscriptSegment,
  SemanticEvent,
  GeneratedQuestion,
} from './types';

// In-memory store
const sessions = new Map<string, SessionState>();

// SSE connections for real-time updates
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

// ============================================
// Session Management
// ============================================

export function createSession(): SessionState {
  const session: SessionState = {
    id: uuidv4(),
    status: 'idle',
    startTime: Date.now(),
    transcript: [],
    semanticEvents: [],
    questions: [],
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function updateSessionStatus(
  sessionId: string,
  status: SessionState['status']
): SessionState | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    if (status === 'ended') {
      session.endTime = Date.now();
    }
    broadcastToSession(sessionId, {
      type: 'status',
      data: { status },
      timestamp: Date.now(),
      sessionId,
    });
  }
  return session;
}

export function deleteSession(sessionId: string): boolean {
  connections.delete(sessionId);
  return sessions.delete(sessionId);
}

// ============================================
// Transcript Management
// ============================================

export function addTranscriptSegment(
  sessionId: string,
  segment: TranscriptSegment
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.transcript.push(segment);
    broadcastToSession(sessionId, {
      type: 'transcript',
      data: segment,
      timestamp: Date.now(),
      sessionId,
    });
  }
}

export function getFullTranscript(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) return '';
  return session.transcript.map(s => s.text).join(' ');
}

// ============================================
// Semantic Events Management
// ============================================

export function addSemanticEvent(
  sessionId: string,
  event: SemanticEvent
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.semanticEvents.push(event);
    broadcastToSession(sessionId, {
      type: 'semantic_event',
      data: event,
      timestamp: Date.now(),
      sessionId,
    });
  }
}

export function getSemanticEvents(sessionId: string): SemanticEvent[] {
  return sessions.get(sessionId)?.semanticEvents || [];
}

// ============================================
// Questions Management
// ============================================

export function addQuestion(
  sessionId: string,
  question: GeneratedQuestion
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.questions.push(question);
    broadcastToSession(sessionId, {
      type: 'question',
      data: question,
      timestamp: Date.now(),
      sessionId,
    });
  }
}

export function addQuestions(
  sessionId: string,
  questions: GeneratedQuestion[]
): void {
  questions.forEach(q => addQuestion(sessionId, q));
}

export function getQuestions(sessionId: string): GeneratedQuestion[] {
  return sessions.get(sessionId)?.questions || [];
}

// ============================================
// Summary Management
// ============================================

export function setSummary(sessionId: string, summary: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.summary = summary;
    broadcastToSession(sessionId, {
      type: 'summary',
      data: { summary },
      timestamp: Date.now(),
      sessionId,
    });
  }
}

// ============================================
// SSE Connection Management
// ============================================

export function addConnection(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  if (!connections.has(sessionId)) {
    connections.set(sessionId, new Set());
  }
  connections.get(sessionId)!.add(controller);
}

export function removeConnection(
  sessionId: string,
  controller: ReadableStreamDefaultController
): void {
  const sessionConnections = connections.get(sessionId);
  if (sessionConnections) {
    sessionConnections.delete(controller);
    if (sessionConnections.size === 0) {
      connections.delete(sessionId);
    }
  }
}

export function broadcastToSession(
  sessionId: string,
  event: {
    type: string;
    data: unknown;
    timestamp: number;
    sessionId: string;
  }
): void {
  const sessionConnections = connections.get(sessionId);
  if (sessionConnections) {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    sessionConnections.forEach(controller => {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch (e) {
        console.error('Failed to send to connection:', e);
      }
    });
  }
}

// ============================================
// Utility Functions
// ============================================

export function getSessionStats(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const fullTranscript = getFullTranscript(sessionId);
  
  return {
    duration: session.endTime
      ? session.endTime - session.startTime
      : Date.now() - session.startTime,
    transcriptLength: session.transcript.length,
    wordCount: fullTranscript.split(/\s+/).filter(w => w.length > 0).length,
    eventCount: session.semanticEvents.length,
    questionCount: session.questions.length,
    hasSummary: !!session.summary,
  };
}
