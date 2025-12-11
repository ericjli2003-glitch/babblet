'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioStreamerOptions {
  sessionId: string;
  chunkDuration?: number; // in milliseconds (250-500ms recommended)
  onAudioLevel?: (level: number) => void;
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useAudioStreamer({
  sessionId,
  chunkDuration = 500,
  onAudioLevel,
  onTranscript,
  onError,
}: UseAudioStreamerOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunkCountRef = useRef(0);
  const startTimeRef = useRef<number>(0);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    chunkCountRef.current = 0;
  }, []);

  // Audio level monitoring
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !onAudioLevel) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average level
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const avg = sum / dataArray.length;
    const normalizedLevel = avg / 255;
    
    onAudioLevel(normalizedLevel);
    
    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
    }
  }, [isRecording, onAudioLevel]);

  // Send audio chunk to server
  const sendAudioChunk = useCallback(async (blob: Blob) => {
    if (!sessionId) return;
    
    const formData = new FormData();
    formData.append('audio', blob);
    formData.append('sessionId', sessionId);
    formData.append('timestamp', String(Date.now() - startTimeRef.current));
    formData.append('mimeType', blob.type);
    formData.append('chunkIndex', String(chunkCountRef.current++));
    
    try {
      const response = await fetch('/api/audio-chunk', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send audio chunk');
      }
      
      const data = await response.json();
      
      if (data.transcript?.text && onTranscript) {
        onTranscript(data.transcript.text);
      }
    } catch (err) {
      console.error('Failed to send audio chunk:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onError?.(message);
    }
  }, [sessionId, onTranscript, onError]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (isRecording || isInitializing) return;
    
    setIsInitializing(true);
    setError(null);
    
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      
      streamRef.current = stream;
      startTimeRef.current = Date.now();
      
      // Set up audio context for level monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 16000,
      });
      
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await sendAudioChunk(event.data);
        }
      };
      
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
        onError?.('Recording error occurred');
      };
      
      mediaRecorderRef.current = recorder;
      
      // Start recording with chunks
      recorder.start(chunkDuration);
      
      setIsRecording(true);
      setIsInitializing(false);
      
      // Start audio level monitoring
      animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(message);
      onError?.(message);
      setIsInitializing(false);
      cleanup();
    }
  }, [isRecording, isInitializing, chunkDuration, sendAudioChunk, monitorAudioLevel, cleanup, onError]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    
    setIsRecording(false);
    cleanup();
  }, [isRecording, cleanup]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isRecording,
    isInitializing,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}

