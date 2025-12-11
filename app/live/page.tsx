'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Square, 
  Clock,
  FileText,
  MessageCircleQuestion,
  LayoutGrid,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import WaveformVisualizer from '@/components/WaveformVisualizer';
import TranscriptPanel from '@/components/TranscriptPanel';
import QuestionsPanel from '@/components/QuestionsPanel';
import { useAudioStreamer } from '@/lib/hooks/useAudioStreamer';
import type { 
  SessionState, 
  TranscriptSegment, 
  SemanticEvent, 
  GeneratedQuestion,
  StreamEvent,
} from '@/lib/types';

type ViewMode = 'split' | 'transcript' | 'questions';

export default function LivePage() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionState['status']>('idle');
  const [duration, setDuration] = useState(0);
  
  // Data state
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [semanticEvents, setSemanticEvents] = useState<SemanticEvent[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [summary, setSummary] = useState<string>('');
  
  // UI state
  const [audioLevel, setAudioLevel] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio streamer hook
  const { 
    isRecording, 
    isInitializing, 
    error: recorderError,
    startRecording, 
    stopRecording,
  } = useAudioStreamer({
    sessionId: sessionId || '',
    chunkDuration: 500,
    onAudioLevel: setAudioLevel,
    onError: setError,
  });

  // Create session
  const createSession = useCallback(async () => {
    try {
      const response = await fetch('/api/session', { method: 'POST' });
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error);
      
      setSessionId(data.sessionId);
      return data.sessionId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, []);

  // Connect to SSE stream
  const connectToStream = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/stream?sessionId=${sid}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        
        switch (data.type) {
          case 'init':
            const initData = data.data as {
              transcript: TranscriptSegment[];
              semanticEvents: SemanticEvent[];
              questions: GeneratedQuestion[];
              summary?: string;
            };
            setTranscripts(initData.transcript || []);
            setSemanticEvents(initData.semanticEvents || []);
            setQuestions(initData.questions || []);
            if (initData.summary) setSummary(initData.summary);
            break;
            
          case 'transcript':
            setTranscripts(prev => [...prev, data.data as TranscriptSegment]);
            break;
            
          case 'semantic_event':
            setSemanticEvents(prev => [...prev, data.data as SemanticEvent]);
            break;
            
          case 'question':
            setQuestions(prev => [...prev, data.data as GeneratedQuestion]);
            break;
            
          case 'summary':
            setSummary((data.data as { summary: string }).summary);
            break;
            
          case 'status':
            setStatus((data.data as { status: SessionState['status'] }).status);
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
    };
  }, []);

  // Start listening
  const handleStartListening = async () => {
    let sid = sessionId;
    
    if (!sid) {
      sid = await createSession();
      if (!sid) return;
    }
    
    connectToStream(sid);
    setStatus('listening');
    startRecording();
    
    // Start duration timer
    durationIntervalRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
  };

  // Stop listening
  const handleStopListening = async () => {
    stopRecording();
    setStatus('ended');
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    
    // Generate summary
    if (sessionId && transcripts.length > 0) {
      try {
        const response = await fetch('/api/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await response.json();
        if (data.summary) setSummary(data.summary);
      } catch (err) {
        console.error('Failed to generate summary:', err);
      }
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-surface-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2 rounded-xl hover:bg-surface-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-surface-500" />
            </Link>
            
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-soft">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg gradient-text">Babblet</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Duration */}
            {status !== 'idle' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-100 rounded-lg">
                <Clock className="w-4 h-4 text-primary-500" />
                <span className="font-mono text-surface-700">{formatDuration(duration)}</span>
              </div>
            )}
            
            {/* View mode toggle */}
            <div className="flex bg-surface-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('split')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'split' ? 'bg-white shadow-soft text-primary-500' : 'text-surface-500 hover:text-surface-700'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('transcript')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'transcript' ? 'bg-white shadow-soft text-primary-500' : 'text-surface-500 hover:text-surface-700'}`}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('questions')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'questions' ? 'bg-white shadow-soft text-primary-500' : 'text-surface-500 hover:text-surface-700'}`}
              >
                <MessageCircleQuestion className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Error display */}
        {(error || recorderError) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600"
          >
            {error || recorderError}
          </motion.div>
        )}

        {/* Control bar */}
        <div className="mb-6">
          <div className="card-neumorphic p-6">
            <div className="flex items-center justify-between">
              {/* Waveform */}
              <div className="flex-1 max-w-md">
                <WaveformVisualizer 
                  isActive={isRecording} 
                  audioLevel={audioLevel}
                />
              </div>
              
              {/* Controls */}
              <div className="flex items-center gap-4">
                {status === 'idle' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartListening}
                    disabled={isInitializing}
                    className="btn-primary gap-3"
                  >
                    {isInitializing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5" />
                        Start Listening
                      </>
                    )}
                  </motion.button>
                )}
                
                {status === 'listening' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStopListening}
                    className="flex items-center gap-3 px-6 py-3 bg-rose-500 text-white font-medium rounded-2xl hover:bg-rose-600 shadow-soft transition-all"
                  >
                    <Square className="w-5 h-5" />
                    Stop
                  </motion.button>
                )}
                
                {status === 'ended' && (
                  <div className="flex items-center gap-3">
                    <span className="text-surface-500">Session ended</span>
                    <button
                      onClick={() => {
                        setSessionId(null);
                        setStatus('idle');
                        setTranscripts([]);
                        setSemanticEvents([]);
                        setQuestions([]);
                        setSummary('');
                        setDuration(0);
                      }}
                      className="btn-secondary"
                    >
                      New Session
                    </button>
                  </div>
                )}
              </div>
              
              {/* Stats */}
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-surface-900">{transcripts.length}</div>
                  <div className="text-surface-400">Segments</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-500">{semanticEvents.length}</div>
                  <div className="text-surface-400">Events</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent-500">{questions.length}</div>
                  <div className="text-surface-400">Questions</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Panels */}
        <div className="grid gap-4" style={{ 
          gridTemplateColumns: viewMode === 'split' ? '1fr 1fr' : '1fr',
          minHeight: 'calc(100vh - 320px)',
        }}>
          {(viewMode === 'split' || viewMode === 'transcript') && (
            <TranscriptPanel
              segments={transcripts}
              semanticEvents={semanticEvents}
              isListening={isRecording}
            />
          )}
          
          {(viewMode === 'split' || viewMode === 'questions') && (
            <QuestionsPanel questions={questions} />
          )}
        </div>

        {/* Summary section */}
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 card-neumorphic p-6 bg-gradient-subtle"
          >
            <h3 className="text-lg font-semibold text-surface-900 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-gradient-primary flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-white" />
              </span>
              AI Summary
            </h3>
            <p className="text-surface-600 leading-relaxed">{summary}</p>
          </motion.div>
        )}
      </main>
    </div>
  );
}
