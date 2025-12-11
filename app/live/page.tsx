'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Square, 
  Sparkles,
  Clock,
  FileText,
  MessageCircleQuestion,
  LayoutGrid,
  ArrowLeft
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </Link>
            
            <div className="flex items-center gap-2">
              <div className="flex">
                <Sparkles className="w-6 h-6 text-purple-400" />
                <Sparkles className="w-4 h-4 text-blue-400 -ml-2 mt-2" />
              </div>
              <span className="font-bold text-xl bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Babblet
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Duration */}
            {status !== 'idle' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-white">{formatDuration(duration)}</span>
              </div>
            )}
            
            {/* View mode toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('split')}
                className={`p-2 rounded transition-colors ${viewMode === 'split' ? 'bg-purple-500 text-white' : 'text-white/60 hover:text-white'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('transcript')}
                className={`p-2 rounded transition-colors ${viewMode === 'transcript' ? 'bg-purple-500 text-white' : 'text-white/60 hover:text-white'}`}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('questions')}
                className={`p-2 rounded transition-colors ${viewMode === 'questions' ? 'bg-purple-500 text-white' : 'text-white/60 hover:text-white'}`}
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
            className="mb-4 p-4 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300"
          >
            {error || recorderError}
          </motion.div>
        )}

        {/* Control bar */}
        <div className="mb-6">
          <div className="bg-slate-900/70 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
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
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStartListening}
                    disabled={isInitializing}
                    className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50"
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
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStopListening}
                      className="flex items-center gap-3 px-6 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors"
                    >
                      <Square className="w-5 h-5" />
                      Stop
                    </motion.button>
                  </>
                )}
                
                {status === 'ended' && (
                  <div className="flex items-center gap-3">
                    <span className="text-white/60">Session ended</span>
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
                      className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      New Session
                    </button>
                  </div>
                )}
              </div>
              
              {/* Stats */}
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{transcripts.length}</div>
                  <div className="text-white/50">Segments</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">{semanticEvents.length}</div>
                  <div className="text-white/50">Events</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{questions.length}</div>
                  <div className="text-white/50">Questions</div>
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
            className="mt-6 bg-gradient-to-br from-purple-900/40 to-blue-900/40 rounded-2xl border border-purple-500/30 p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Summary
            </h3>
            <p className="text-white/80 leading-relaxed">{summary}</p>
          </motion.div>
        )}
      </main>
    </div>
  );
}
