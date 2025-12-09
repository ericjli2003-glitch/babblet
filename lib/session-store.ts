// ============================================
// In-Memory Session Store
// For MVP purposes - would use Redis/DB in production
// ============================================

import { v4 as uuidv4 } from 'uuid';
import type {
  PresentationSession,
  PresentationStatus,
  TranscriptChunk,
  TranscriptSegment,
  AnalysisSummary,
  QuestionBank,
  RubricEvaluation,
  SlideAnalysis,
  GeneratedQuestion,
} from './types';

// In-memory store
const sessions = new Map<string, PresentationSession>();

// ============================================
// Session Management
// ============================================

export function createSession(metadata?: Partial<PresentationSession['metadata']>): PresentationSession {
  const session: PresentationSession = {
    id: uuidv4(),
    status: 'idle',
    startTime: Date.now(),
    transcript: [],
    questions: {
      clarifying: [],
      criticalThinking: [],
      expansion: [],
    },
    metadata: {
      title: metadata?.title || 'Untitled Presentation',
      presenterName: metadata?.presenterName,
      ...metadata,
    },
  };

  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): PresentationSession | undefined {
  return sessions.get(sessionId);
}

export function updateSessionStatus(
  sessionId: string,
  status: PresentationStatus
): PresentationSession | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    if (status === 'completed' && !session.endTime) {
      session.endTime = Date.now();
    }
    sessions.set(sessionId, session);
  }
  return session;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

// ============================================
// Transcript Management
// ============================================

export function addTranscriptSegment(
  sessionId: string,
  segment: TranscriptSegment
): TranscriptChunk | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  // Find or create the current chunk
  let currentChunk = session.transcript[session.transcript.length - 1];
  
  if (!currentChunk || currentChunk.segments.length >= 10) {
    // Create new chunk every 10 segments
    currentChunk = {
      segments: [],
      startTime: segment.timestamp,
      endTime: segment.timestamp,
      fullText: '',
    };
    session.transcript.push(currentChunk);
  }

  currentChunk.segments.push(segment);
  currentChunk.endTime = segment.timestamp + segment.duration;
  currentChunk.fullText = currentChunk.segments.map(s => s.text).join(' ');

  sessions.set(sessionId, session);
  return currentChunk;
}

export function getFullTranscript(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) return '';

  return session.transcript
    .flatMap(chunk => chunk.segments)
    .map(segment => segment.text)
    .join(' ');
}

export function getTranscriptSegments(sessionId: string): TranscriptSegment[] {
  const session = sessions.get(sessionId);
  if (!session) return [];

  return session.transcript.flatMap(chunk => chunk.segments);
}

// ============================================
// Analysis Management
// ============================================

export function updateAnalysis(
  sessionId: string,
  analysis: AnalysisSummary
): PresentationSession | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.analysis = analysis;
    sessions.set(sessionId, session);
  }
  return session;
}

export function getAnalysis(sessionId: string): AnalysisSummary | undefined {
  return sessions.get(sessionId)?.analysis;
}

// ============================================
// Question Management
// ============================================

export function addQuestions(
  sessionId: string,
  questions: GeneratedQuestion[]
): QuestionBank | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  questions.forEach(question => {
    switch (question.category) {
      case 'clarifying':
        session.questions.clarifying.push(question);
        break;
      case 'critical-thinking':
        session.questions.criticalThinking.push(question);
        break;
      case 'expansion':
        session.questions.expansion.push(question);
        break;
    }
  });

  sessions.set(sessionId, session);
  return session.questions;
}

export function getQuestions(sessionId: string): QuestionBank | undefined {
  return sessions.get(sessionId)?.questions;
}

// ============================================
// Rubric Management
// ============================================

export function updateRubric(
  sessionId: string,
  rubric: RubricEvaluation
): PresentationSession | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.rubric = rubric;
    sessions.set(sessionId, session);
  }
  return session;
}

export function getRubric(sessionId: string): RubricEvaluation | undefined {
  return sessions.get(sessionId)?.rubric;
}

// ============================================
// Slide Analysis Management
// ============================================

export function updateSlideAnalysis(
  sessionId: string,
  slideAnalysis: SlideAnalysis
): PresentationSession | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.slideAnalysis = slideAnalysis;
    sessions.set(sessionId, session);
  }
  return session;
}

export function getSlideAnalysis(sessionId: string): SlideAnalysis | undefined {
  return sessions.get(sessionId)?.slideAnalysis;
}

// ============================================
// Utility Functions
// ============================================

export function getAllSessions(): PresentationSession[] {
  return Array.from(sessions.values());
}

export function cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let deletedCount = 0;

  sessions.forEach((session, id) => {
    const sessionAge = now - session.startTime;
    if (sessionAge > maxAgeMs) {
      sessions.delete(id);
      deletedCount++;
    }
  });

  return deletedCount;
}

export function getSessionStats(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const transcriptSegments = getTranscriptSegments(sessionId);
  const fullTranscript = getFullTranscript(sessionId);

  return {
    duration: session.endTime 
      ? session.endTime - session.startTime 
      : Date.now() - session.startTime,
    segmentCount: transcriptSegments.length,
    wordCount: fullTranscript.split(/\s+/).filter(w => w.length > 0).length,
    claimCount: session.analysis?.keyClaims.length || 0,
    gapCount: session.analysis?.logicalGaps.length || 0,
    questionCount: 
      (session.questions.clarifying.length || 0) +
      (session.questions.criticalThinking.length || 0) +
      (session.questions.expansion.length || 0),
  };
}

