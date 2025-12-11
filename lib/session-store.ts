// ============================================
// Session Store for Babblet
// In-memory session management
// ============================================

import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  TranscriptSegment,
  GeneratedQuestion,
  AnalysisSummary,
  RubricEvaluation,
  PresentationStatus,
} from './types';

// In-memory store
const sessions = new Map<string, SessionState>();

// SSE connections for real-time updates
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

// ============================================
// Session Management
// ============================================

export function createSession(metadata?: { title?: string; presenterName?: string }): SessionState {
  const session: SessionState = {
    id: uuidv4(),
    status: 'idle',
    startTime: Date.now(),
    transcript: [],
    semanticEvents: [],
    questions: [],
    metadata,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function updateSessionStatus(
  sessionId: string,
  status: PresentationStatus
): SessionState | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    if (status === 'completed') {
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
  }
}

export function getFullTranscript(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) return '';
  return session.transcript.map(s => s.text).join(' ');
}

// ============================================
// Analysis Management
// ============================================

export function setAnalysis(
  sessionId: string,
  analysis: AnalysisSummary
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.analysis = analysis;
  }
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
  }
}

export function getQuestions(sessionId: string): GeneratedQuestion[] {
  return sessions.get(sessionId)?.questions || [];
}

// ============================================
// Rubric Management
// ============================================

export function setRubric(
  sessionId: string,
  rubric: RubricEvaluation
): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.rubric = rubric;
  }
}

// ============================================
// Summary Management
// ============================================

export function setSummary(sessionId: string, summary: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.summary = summary;
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
    questionCount: session.questions.length,
    hasAnalysis: !!session.analysis,
    hasRubric: !!session.rubric,
  };
}
