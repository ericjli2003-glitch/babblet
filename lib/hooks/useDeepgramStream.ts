'use client';

import { useRef, useCallback, useState } from 'react';

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

interface DeepgramResult {
  type: string;
  channel_index: number[];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: {
    alternatives: DeepgramAlternative[];
  };
}

interface UseDeepgramStreamOptions {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useDeepgramStream(options: UseDeepgramStreamOptions = {}) {
  const { onInterimTranscript, onFinalTranscript, onError } = options;
  
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const apiKeyRef = useRef<string | null>(null);

  // Fetch API key from server
  const getApiKey = useCallback(async () => {
    if (apiKeyRef.current) return apiKeyRef.current;
    
    try {
      const response = await fetch('/api/deepgram-key');
      const data = await response.json();
      if (data.key) {
        apiKeyRef.current = data.key;
        return data.key;
      }
      throw new Error('No API key returned');
    } catch (e) {
      console.error('[Deepgram] Failed to get API key:', e);
      onError?.('Failed to get Deepgram API key');
      return null;
    }
  }, [onError]);

  const connect = useCallback(async (stream: MediaStream) => {
    const apiKey = await getApiKey();
    if (!apiKey) return false;

    try {
      // Close any existing connection
      if (socketRef.current) {
        socketRef.current.close();
      }

      // Connect to Deepgram WebSocket
      const socket = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
          model: 'nova-2',
          language: 'en',
          smart_format: 'true',
          interim_results: 'true',
          utterance_end_ms: '1000',
          vad_events: 'true',
          endpointing: '300',
        }),
        ['token', apiKey]
      );

      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[Deepgram] WebSocket connected');
        setIsConnected(true);
        
        // Start streaming audio
        startAudioStream(stream);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'Results') {
            const result = data as DeepgramResult;
            const transcript = result.channel?.alternatives?.[0]?.transcript;
            
            if (transcript && transcript.trim()) {
              if (result.is_final) {
                console.log('[Deepgram] Final:', transcript);
                onFinalTranscript?.(transcript);
              } else {
                console.log('[Deepgram] Interim:', transcript);
                onInterimTranscript?.(transcript);
              }
            }
          } else if (data.type === 'UtteranceEnd') {
            console.log('[Deepgram] Utterance end');
          }
        } catch (e) {
          console.error('[Deepgram] Parse error:', e);
        }
      };

      socket.onerror = (event) => {
        console.error('[Deepgram] WebSocket error:', event);
        onError?.('WebSocket connection error');
      };

      socket.onclose = (event) => {
        console.log('[Deepgram] WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsStreaming(false);
      };

      return true;
    } catch (e) {
      console.error('[Deepgram] Connection error:', e);
      onError?.('Failed to connect to Deepgram');
      return false;
    }
  }, [getApiKey, onInterimTranscript, onFinalTranscript, onError]);

  const startAudioStream = useCallback((stream: MediaStream) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error('[Deepgram] Socket not ready');
      return;
    }

    // Create MediaRecorder to capture audio
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 16000,
    });
    
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(event.data);
      }
    };

    // Send audio data every 250ms for real-time feel
    mediaRecorder.start(250);
    setIsStreaming(true);
    console.log('[Deepgram] Audio streaming started');
  }, []);

  const disconnect = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Close WebSocket
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        // Send close message
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsConnected(false);
    setIsStreaming(false);
    console.log('[Deepgram] Disconnected');
  }, []);

  return {
    connect,
    disconnect,
    isConnected,
    isStreaming,
  };
}

