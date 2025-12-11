// ============================================
// Pusher Real-Time Integration
// For live transcript/question sharing
// ============================================

import Pusher from 'pusher';
import type {
    TranscriptSegment,
    GeneratedQuestion,
    AnalysisSummary,
    RubricEvaluation
} from './types';

// Server-side Pusher client (for triggering events)
let pusherServer: Pusher | null = null;

export function getPusherServer(): Pusher | null {
    if (!isPusherConfigured()) {
        return null;
    }

    if (!pusherServer) {
        pusherServer = new Pusher({
            appId: process.env.PUSHER_APP_ID!,
            key: process.env.PUSHER_KEY!,
            secret: process.env.PUSHER_SECRET!,
            cluster: process.env.PUSHER_CLUSTER!,
            useTLS: true,
        });
    }

    return pusherServer;
}

export function isPusherConfigured(): boolean {
    return !!(
        process.env.PUSHER_APP_ID &&
        process.env.PUSHER_KEY &&
        process.env.PUSHER_SECRET &&
        process.env.PUSHER_CLUSTER
    );
}

// Get public Pusher config for frontend
export function getPusherConfig() {
    return {
        key: process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY || '',
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || process.env.PUSHER_CLUSTER || '',
    };
}

// ============================================
// Channel naming convention
// ============================================

export function getSessionChannel(sessionId: string): string {
    return `session-${sessionId}`;
}

// ============================================
// Event Types
// ============================================

export type PusherEventType =
    | 'transcript-update'
    | 'analysis-update'
    | 'question-generated'
    | 'rubric-update'
    | 'status-change'
    | 'session-end';

export interface TranscriptUpdateEvent {
    segment: TranscriptSegment;
}

export interface AnalysisUpdateEvent {
    analysis: AnalysisSummary;
}

export interface QuestionGeneratedEvent {
    questions: GeneratedQuestion[];
}

export interface RubricUpdateEvent {
    rubric: RubricEvaluation;
}

export interface StatusChangeEvent {
    status: string;
    message?: string;
}

// ============================================
// Broadcast Functions
// ============================================

export async function broadcastTranscript(
    sessionId: string,
    segment: TranscriptSegment
): Promise<boolean> {
    const pusher = getPusherServer();
    if (!pusher) {
        console.log('[Pusher] Not configured, skipping broadcast');
        return false;
    }

    try {
        await pusher.trigger(
            getSessionChannel(sessionId),
            'transcript-update',
            { segment } as TranscriptUpdateEvent
        );
        console.log(`[Pusher] Broadcast transcript to session ${sessionId}`);
        return true;
    } catch (error) {
        console.error('[Pusher] Failed to broadcast transcript:', error);
        return false;
    }
}

export async function broadcastAnalysis(
    sessionId: string,
    analysis: AnalysisSummary
): Promise<boolean> {
    const pusher = getPusherServer();
    if (!pusher) return false;

    try {
        await pusher.trigger(
            getSessionChannel(sessionId),
            'analysis-update',
            { analysis } as AnalysisUpdateEvent
        );
        console.log(`[Pusher] Broadcast analysis to session ${sessionId}`);
        return true;
    } catch (error) {
        console.error('[Pusher] Failed to broadcast analysis:', error);
        return false;
    }
}

export async function broadcastQuestions(
    sessionId: string,
    questions: GeneratedQuestion[]
): Promise<boolean> {
    const pusher = getPusherServer();
    if (!pusher) return false;

    try {
        await pusher.trigger(
            getSessionChannel(sessionId),
            'question-generated',
            { questions } as QuestionGeneratedEvent
        );
        console.log(`[Pusher] Broadcast ${questions.length} questions to session ${sessionId}`);
        return true;
    } catch (error) {
        console.error('[Pusher] Failed to broadcast questions:', error);
        return false;
    }
}

export async function broadcastRubric(
    sessionId: string,
    rubric: RubricEvaluation
): Promise<boolean> {
    const pusher = getPusherServer();
    if (!pusher) return false;

    try {
        await pusher.trigger(
            getSessionChannel(sessionId),
            'rubric-update',
            { rubric } as RubricUpdateEvent
        );
        console.log(`[Pusher] Broadcast rubric to session ${sessionId}`);
        return true;
    } catch (error) {
        console.error('[Pusher] Failed to broadcast rubric:', error);
        return false;
    }
}

export async function broadcastStatus(
    sessionId: string,
    status: string,
    message?: string
): Promise<boolean> {
    const pusher = getPusherServer();
    if (!pusher) return false;

    try {
        await pusher.trigger(
            getSessionChannel(sessionId),
            'status-change',
            { status, message } as StatusChangeEvent
        );
        console.log(`[Pusher] Broadcast status "${status}" to session ${sessionId}`);
        return true;
    } catch (error) {
        console.error('[Pusher] Failed to broadcast status:', error);
        return false;
    }
}

