'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import type { 
  TranscriptSegment, 
  GeneratedQuestion, 
  AnalysisSummary,
  RubricEvaluation 
} from '@/lib/types';

interface PusherConfig {
  key: string;
  cluster: string;
  configured: boolean;
}

interface UsePusherOptions {
  sessionId: string | null;
  onTranscript?: (segment: TranscriptSegment) => void;
  onAnalysis?: (analysis: AnalysisSummary) => void;
  onQuestions?: (questions: GeneratedQuestion[]) => void;
  onRubric?: (rubric: RubricEvaluation) => void;
  onStatusChange?: (status: string, message?: string) => void;
}

export function usePusher({
  sessionId,
  onTranscript,
  onAnalysis,
  onQuestions,
  onRubric,
  onStatusChange,
}: UsePusherOptions) {
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'unavailable'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);

  // Fetch Pusher config from server
  const fetchConfig = useCallback(async (): Promise<PusherConfig | null> => {
    try {
      const response = await fetch('/api/pusher-config');
      const config = await response.json();
      return config;
    } catch (e) {
      console.error('[Pusher] Failed to fetch config:', e);
      return null;
    }
  }, []);

  // Connect to Pusher
  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;

    const connect = async () => {
      const config = await fetchConfig();
      
      if (!isMounted) return;
      
      if (!config || !config.configured || !config.key || !config.cluster) {
        console.log('[Pusher] Not configured, skipping connection');
        setConnectionState('unavailable');
        return;
      }

      try {
        setConnectionState('connecting');

        // Create Pusher instance
        const pusher = new Pusher(config.key, {
          cluster: config.cluster,
        });
        pusherRef.current = pusher;

        // Monitor connection state
        pusher.connection.bind('connected', () => {
          if (isMounted) {
            console.log('[Pusher] Connected');
            setConnectionState('connected');
            setError(null);
          }
        });

        pusher.connection.bind('disconnected', () => {
          if (isMounted) {
            console.log('[Pusher] Disconnected');
            setConnectionState('disconnected');
          }
        });

        pusher.connection.bind('error', (err: Error) => {
          if (isMounted) {
            console.error('[Pusher] Connection error:', err);
            setError(err.message);
          }
        });

        // Subscribe to session channel
        const channelName = `session-${sessionId}`;
        const channel = pusher.subscribe(channelName);
        channelRef.current = channel;

        console.log(`[Pusher] Subscribing to channel: ${channelName}`);

        // Bind event handlers
        channel.bind('transcript-update', (data: { segment: TranscriptSegment }) => {
          console.log('[Pusher] Received transcript:', data.segment.text.slice(0, 50));
          onTranscript?.(data.segment);
        });

        channel.bind('analysis-update', (data: { analysis: AnalysisSummary }) => {
          console.log('[Pusher] Received analysis');
          onAnalysis?.(data.analysis);
        });

        channel.bind('question-generated', (data: { questions: GeneratedQuestion[] }) => {
          console.log(`[Pusher] Received ${data.questions.length} questions`);
          onQuestions?.(data.questions);
        });

        channel.bind('rubric-update', (data: { rubric: RubricEvaluation }) => {
          console.log('[Pusher] Received rubric');
          onRubric?.(data.rubric);
        });

        channel.bind('status-change', (data: { status: string; message?: string }) => {
          console.log(`[Pusher] Status change: ${data.status}`);
          onStatusChange?.(data.status, data.message);
        });

      } catch (e) {
        console.error('[Pusher] Setup error:', e);
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Failed to connect');
          setConnectionState('disconnected');
        }
      }
    };

    connect();

    // Cleanup
    return () => {
      isMounted = false;
      
      if (channelRef.current) {
        channelRef.current.unbind_all();
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, [sessionId, fetchConfig, onTranscript, onAnalysis, onQuestions, onRubric, onStatusChange]);

  return {
    connectionState,
    error,
    isConnected: connectionState === 'connected',
    isUnavailable: connectionState === 'unavailable',
  };
}

