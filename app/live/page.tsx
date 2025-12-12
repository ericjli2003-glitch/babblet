'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Settings,
  Download,
  Share2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  Video,
  Link,
  Copy,
  Check,
} from 'lucide-react';
import TranscriptFeed from '@/components/TranscriptFeed';
import QuestionBank from '@/components/QuestionBank';
import SummaryCard from '@/components/SummaryCard';
import RubricCard from '@/components/RubricCard';
import { usePusher } from '@/lib/hooks/usePusher';
import type {
  TranscriptSegment,
  AnalysisSummary,
  GeneratedQuestion,
  RubricEvaluation,
  PresentationStatus,
} from '@/lib/types';

type ActivePanel = 'transcript' | 'analysis' | 'questions' | 'rubric';

function LiveDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('sessionId');
  const mode = searchParams.get('mode') as 'live' | 'upload' | null;

  // State
  const [status, setStatus] = useState<PresentationStatus>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [questions, setQuestions] = useState<{
    clarifying: GeneratedQuestion[];
    criticalThinking: GeneratedQuestion[];
    expansion: GeneratedQuestion[];
  }>({ clarifying: [], criticalThinking: [], expansion: [] });
  const [rubric, setRubric] = useState<RubricEvaluation | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>('transcript');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const lastWordCountRef = useRef<number>(0);
  const pendingQuestionGenRef = useRef<boolean>(false);

  // Centralized transcript handler - deduplicates and triggers question generation
  const addTranscriptSegment = useCallback((segment: TranscriptSegment) => {
    setTranscript((prev) => {
      // Avoid duplicates by ID
      if (prev.some(s => s.id === segment.id)) {
        console.log('[Transcript] Skipping duplicate segment:', segment.id);
        return prev;
      }
      
      // Avoid duplicates by text content (in case IDs differ but text is same)
      const segmentText = segment.text.trim().toLowerCase();
      if (prev.some(s => s.text.trim().toLowerCase() === segmentText)) {
        console.log('[Transcript] Skipping duplicate text:', segment.text.slice(0, 30));
        return prev;
      }
      
      let newTranscript = [...prev, segment];
      
      // Memory safeguard: Consolidate old segments if we have too many
      // Keep last 100 segments to prevent memory issues
      if (newTranscript.length > 100) {
        // Merge older segments into fewer chunks
        const olderSegments = newTranscript.slice(0, -50);
        const recentSegments = newTranscript.slice(-50);
        const consolidatedText = olderSegments.map(s => s.text).join(' ');
        const consolidatedSegment: TranscriptSegment = {
          id: 'consolidated-' + Date.now(),
          text: consolidatedText,
          timestamp: olderSegments[0]?.timestamp || 0,
          duration: 0,
          isFinal: true,
        };
        newTranscript = [consolidatedSegment, ...recentSegments];
        console.log('[Transcript] Consolidated old segments to prevent memory issues');
      }
      
      // Calculate total word count
      const totalWords = newTranscript.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
      const wordsSinceLastAnalysis = totalWords - lastWordCountRef.current;
      
      console.log(`[Transcript] Added segment. Total words: ${totalWords}, since last analysis: ${wordsSinceLastAnalysis}`);
      
      // Trigger question generation every 8 new words (non-blocking)
      if (wordsSinceLastAnalysis >= 8 && !pendingQuestionGenRef.current) {
        lastWordCountRef.current = totalWords;
        pendingQuestionGenRef.current = true;
        
        // Async question generation - don't block transcript updates
        const fullText = newTranscript.map(s => s.text).join(' ');
        triggerAsyncQuestionGeneration(fullText);
      }
      
      return newTranscript;
    });
  }, [triggerAsyncQuestionGeneration]);

  // Async question generation - non-blocking
  const triggerAsyncQuestionGeneration = useCallback(async (transcriptText: string) => {
    if (!sessionId) return;

    console.log('[Questions] Triggering async generation...');

    try {
      // First trigger analysis
      const analysisResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, transcript: transcriptText }),
      });
      const analysisData = await analysisResponse.json();

      if (analysisData.analysis) {
        setAnalysis(analysisData.analysis);

        // Then trigger question generation
        const questionsResponse = await fetch('/api/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            context: {
              transcript: transcriptText,
              claims: analysisData.analysis.keyClaims,
              gaps: analysisData.analysis.logicalGaps,
            },
          }),
        });
        const questionsData = await questionsResponse.json();

        if (questionsData.questions && Array.isArray(questionsData.questions)) {
          setQuestions((prev) => {
            const updated = { ...prev };
            questionsData.questions.forEach((q: GeneratedQuestion) => {
              // Avoid duplicate questions
              const isDuplicate =
                updated.clarifying.some(eq => eq.question === q.question) ||
                updated.criticalThinking.some(eq => eq.question === q.question) ||
                updated.expansion.some(eq => eq.question === q.question);

              if (!isDuplicate) {
                switch (q.category) {
                  case 'clarifying':
                    updated.clarifying = [...updated.clarifying, q];
                    break;
                  case 'critical-thinking':
                    updated.criticalThinking = [...updated.criticalThinking, q];
                    break;
                  case 'expansion':
                    updated.expansion = [...updated.expansion, q];
                    break;
                }
              }
            });
            return updated;
          });
        }
      }
    } catch (e) {
      console.error('[Questions] Generation failed:', e);
    } finally {
      pendingQuestionGenRef.current = false;
    }
  }, [sessionId]);

  // Pusher callbacks for real-time updates from other users
  const handlePusherTranscript = useCallback((segment: TranscriptSegment) => {
    addTranscriptSegment(segment);
  }, [addTranscriptSegment]);

  const handlePusherAnalysis = useCallback((analysis: AnalysisSummary) => {
    setAnalysis(analysis);
    setIsAnalyzing(false);
  }, []);

  const handlePusherQuestions = useCallback((newQuestions: GeneratedQuestion[]) => {
    setQuestions((prev) => {
      const updated = { ...prev };
      newQuestions.forEach((q) => {
        // Avoid duplicates
        const isDuplicate =
          updated.clarifying.some(eq => eq.id === q.id) ||
          updated.criticalThinking.some(eq => eq.id === q.id) ||
          updated.expansion.some(eq => eq.id === q.id);

        if (!isDuplicate) {
          switch (q.category) {
            case 'clarifying':
              updated.clarifying = [...updated.clarifying, q];
              break;
            case 'critical-thinking':
              updated.criticalThinking = [...updated.criticalThinking, q];
              break;
            case 'expansion':
              updated.expansion = [...updated.expansion, q];
              break;
          }
        }
      });
      return updated;
    });
    setIsGeneratingQuestions(false);
  }, []);

  const handlePusherRubric = useCallback((newRubric: RubricEvaluation) => {
    setRubric(newRubric);
  }, []);

  // Connect to Pusher for real-time multi-user updates
  const { connectionState: pusherState, isConnected: pusherConnected } = usePusher({
    sessionId,
    onTranscript: handlePusherTranscript,
    onAnalysis: handlePusherAnalysis,
    onQuestions: handlePusherQuestions,
    onRubric: handlePusherRubric,
  });

  // Update connection status based on Pusher
  useEffect(() => {
    if (pusherConnected) {
      setConnectionStatus('connected');
    } else if (pusherState === 'connecting') {
      setConnectionStatus('connecting');
    }
    // Don't set to disconnected if Pusher is unavailable - direct API still works
  }, [pusherConnected, pusherState]);

  // Generate shareable link
  const getShareLink = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('watch', 'true');
    return url.toString();
  }, []);

  const copyShareLink = useCallback(async () => {
    const link = getShareLink();
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [getShareLink]);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(0);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoChunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sendAudioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioMimeTypeRef = useRef<string>('audio/webm');

  // Get the best supported audio mimeType
  const getSupportedMimeType = useCallback(() => {
    const mimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log(`[Audio] Using mimeType: ${mimeType}`);
        return mimeType;
      }
    }

    console.warn('[Audio] No preferred mimeType supported, using default');
    return '';
  }, []);

  // SSE is disabled - Vercel serverless times out after ~60s
  // We use Pusher for real-time multi-user updates + direct API responses
  // This avoids the blank screen issue after 3 minutes
  useEffect(() => {
    if (!sessionId) return;

    // Set connected status - we're using direct API responses which always work
    setConnectionStatus('connected');
    
    // SSE disabled due to Vercel serverless timeout limitations
    // Real-time updates come from:
    // 1. Direct API responses (primary)
    // 2. Pusher (for multi-user sync)
    
    console.log('[Session] Connected via direct API + Pusher (SSE disabled for stability)');
  }, [sessionId]);

  // Audio level visualization
  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && (isRecording || isPlaying)) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(average / 255);
      requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording, isPlaying]);

  // Handle video file selection
  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    }
  }, []);

  // Process video - extract audio and send for transcription
  const processVideo = async () => {
    if (!videoRef.current || !videoUrl) return;

    const video = videoRef.current;

    try {
      // Create audio context
      audioContextRef.current = new AudioContext();

      // Create media element source from video
      const source = audioContextRef.current.createMediaElementSource(video);

      // Create analyser for visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      // Create destination for recording
      const destination = audioContextRef.current.createMediaStreamDestination();

      // Connect: source -> analyser -> destination (for recording)
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination); // So we can hear it
      source.connect(destination);

      // Set up MediaRecorder to capture audio with best supported format
      const mimeType = getSupportedMimeType();
      audioMimeTypeRef.current = mimeType || 'audio/webm';

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(destination.stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      console.log(`[Video] MediaRecorder initialized with mimeType: ${mediaRecorder.mimeType}`);

      startTimeRef.current = Date.now();

      // Use onstop to send complete audio segments
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`[Video] Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0 && video && !video.paused) {
          const actualMimeType = audioChunksRef.current[0]?.type || audioMimeTypeRef.current;
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
          console.log(`[Video] Sending complete audio: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
          const currentTimestamp = video.currentTime * 1000;

          // Clear chunks for next segment
          audioChunksRef.current = [];

          if (audioBlob.size > 5000) {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            formData.append('sessionId', sessionId || '');
            formData.append('timestamp', String(currentTimestamp));

            try {
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
              });
              const data = await response.json();

              if (data.segment && data.segment.text) {
                addTranscriptSegment(data.segment);
              }

              if (data.error) {
                console.log('[Video] Transcription message:', data.error);
              }
            } catch (e) {
              console.error('Failed to send audio:', e);
            }
          }

          // Restart recording if video is still playing
          if (!video.paused && !video.ended && mediaRecorderRef.current?.state === 'inactive') {
            try {
              mediaRecorderRef.current?.start();
              console.log('[Video] MediaRecorder restarted');
            } catch (e) {
              console.log('[Video] Could not restart recorder:', e);
            }
          }
        }
      };

      // Stop and restart recorder every 10 seconds to create complete segments
      sendAudioIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log('[Video] Stopping recorder for segment...');
          mediaRecorderRef.current.stop();
        }
      }, 10000);

      // Start recording (onstop handler will send and restart)
      mediaRecorder.start();

      // Play the video
      video.play();
      setIsPlaying(true);
      setStatus('recording');
      updateAudioLevel();

      // Set up periodic analysis
      analysisIntervalRef.current = setInterval(() => {
        const now = Date.now();
        if (now - lastAnalysisTimeRef.current >= 15000 && transcript.length > 0) {
          triggerAnalysis();
          lastAnalysisTimeRef.current = now;
        }
      }, 5000);

      // Handle video end
      video.onended = async () => {
        mediaRecorder.stop();
        setIsPlaying(false);
        setStatus('processing');

        if (analysisIntervalRef.current) {
          clearInterval(analysisIntervalRef.current);
        }

        if (sendAudioIntervalRef.current) {
          clearInterval(sendAudioIntervalRef.current);
        }

        // Send any remaining audio chunks
        if (audioChunksRef.current.length > 0) {
          const actualMimeType = audioChunksRef.current[0]?.type || audioMimeTypeRef.current;
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
          audioChunksRef.current = [];

          if (audioBlob.size > 1000) {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            formData.append('sessionId', sessionId || '');
            formData.append('timestamp', String(video.currentTime * 1000));

            try {
              const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
              const data = await response.json();
              if (data.segment && data.segment.text) {
                addTranscriptSegment(data.segment);
              }
            } catch (e) {
              console.error('Failed to send final audio chunk:', e);
            }
          }
        }

        // Final analysis and rubric
        await triggerAnalysis();
        await generateRubric();

        setStatus('completed');
      };

    } catch (error) {
      console.error('Failed to process video:', error);
    }
  };

  // Pause/Resume video
  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      mediaRecorderRef.current?.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      mediaRecorderRef.current?.resume();
      setIsPlaying(true);
    }
  };

  // Start live recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up MediaRecorder with best supported format
      const mimeType = getSupportedMimeType();
      audioMimeTypeRef.current = mimeType || 'audio/webm';

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      console.log(`[Live] MediaRecorder initialized with mimeType: ${mediaRecorder.mimeType}`);

      startTimeRef.current = Date.now();

      // Accumulate audio chunks
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`[Live] Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
        }
      };

      // Send complete audio segment when recorder stops
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0 && isRecording) {
          const actualMimeType = audioChunksRef.current[0]?.type || audioMimeTypeRef.current;
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
          console.log(`[Live] Sending complete audio: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
          const currentTimestamp = Date.now() - startTimeRef.current;

          // Clear chunks for next segment
          audioChunksRef.current = [];

          if (audioBlob.size > 5000) {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            formData.append('sessionId', sessionId || '');
            formData.append('timestamp', String(currentTimestamp));

            try {
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
              });
              const data = await response.json();

              if (data.segment && data.segment.text) {
                addTranscriptSegment(data.segment);
              }

              if (data.error) {
                console.log('[Live] Transcription message:', data.error);
              }
            } catch (e) {
              console.error('Failed to send audio:', e);
            }
          }

          // Restart recording if still in recording mode
          if (isRecording && mediaRecorderRef.current?.state === 'inactive' && streamRef.current?.active) {
            try {
              mediaRecorderRef.current?.start();
              console.log('[Live] MediaRecorder restarted');
            } catch (e) {
              console.log('[Live] Could not restart recorder:', e);
            }
          }
        }
      };

      // Stop and restart recorder every 10 seconds to create complete segments
      sendAudioIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log('[Live] Stopping recorder for segment...');
          mediaRecorderRef.current.stop();
        }
      }, 10000);

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setStatus('recording');
      updateAudioLevel();

      // Start periodic analysis
      analysisIntervalRef.current = setInterval(() => {
        const now = Date.now();
        if (now - lastAnalysisTimeRef.current >= 15000 && transcript.length > 0) {
          triggerAnalysis();
          lastAnalysisTimeRef.current = now;
        }
      }, 5000);

    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();

      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }

      if (sendAudioIntervalRef.current) {
        clearInterval(sendAudioIntervalRef.current);
      }

      // Send any remaining audio chunks
      if (audioChunksRef.current.length > 0) {
        const actualMimeType = audioChunksRef.current[0]?.type || audioMimeTypeRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        audioChunksRef.current = [];

        if (audioBlob.size > 1000) {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'audio.webm');
          formData.append('sessionId', sessionId || '');
          formData.append('timestamp', String(Date.now() - startTimeRef.current));

          try {
            const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.segment && data.segment.text) {
              addTranscriptSegment(data.segment);
            }
          } catch (e) {
            console.error('Failed to send final audio chunk:', e);
          }
        }
      }

      setIsRecording(false);
      setStatus('processing');

      // Trigger final analysis and rubric generation
      await triggerAnalysis();
      await generateRubric();

      setStatus('completed');
    }
  }, [isRecording, sessionId]);

  // Trigger analysis
  const triggerAnalysis = async () => {
    if (transcript.length === 0) return;

    setIsAnalyzing(true);

    try {
      const fullTranscript = transcript.map((s) => s.text).join(' ');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transcript: fullTranscript,
        }),
      });
      const data = await response.json();

      // Update analysis directly from response (don't rely on SSE)
      if (data.analysis) {
        setAnalysis(data.analysis);
      }
    } catch (e) {
      console.error('Analysis failed:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate questions
  const triggerQuestionGeneration = async () => {
    if (!analysis) return;

    setIsGeneratingQuestions(true);

    try {
      const fullTranscript = transcript.map((s) => s.text).join(' ');
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          context: {
            transcript: fullTranscript,
            claims: analysis.keyClaims,
            gaps: analysis.logicalGaps,
          },
        }),
      });
      const data = await response.json();

      // Update questions directly from response (don't rely on SSE)
      if (data.questions && Array.isArray(data.questions)) {
        setQuestions((prev) => {
          const newQuestions = { ...prev };
          data.questions.forEach((q: GeneratedQuestion) => {
            switch (q.category) {
              case 'clarifying':
                newQuestions.clarifying = [...newQuestions.clarifying, q];
                break;
              case 'critical-thinking':
                newQuestions.criticalThinking = [...newQuestions.criticalThinking, q];
                break;
              case 'expansion':
                newQuestions.expansion = [...newQuestions.expansion, q];
                break;
            }
          });
          return newQuestions;
        });
      }
    } catch (e) {
      console.error('Question generation failed:', e);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Generate rubric
  const generateRubric = async () => {
    if (transcript.length === 0) return;

    try {
      const fullTranscript = transcript.map((s) => s.text).join(' ');
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transcript: fullTranscript,
        }),
      });
      const data = await response.json();

      // Update rubric directly from response (don't rely on SSE)
      if (data.rubric) {
        setRubric(data.rubric);
      }
    } catch (e) {
      console.error('Rubric generation failed:', e);
    }
  };

  // Timer for live recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setCurrentTime(Date.now() - startTimeRef.current);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Update current time from video
  useEffect(() => {
    if (videoRef.current && isPlaying) {
      const video = videoRef.current;
      const updateTime = () => {
        setCurrentTime(video.currentTime * 1000);
      };
      video.addEventListener('timeupdate', updateTime);
      return () => video.removeEventListener('timeupdate', updateTime);
    }
  }, [isPlaying]);

  // Format time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const panels: { id: ActivePanel; label: string }[] = [
    { id: 'transcript', label: 'Transcript' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'questions', label: 'Questions' },
    { id: 'rubric', label: 'Rubric' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-surface-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="font-semibold text-surface-900">
                    {mode === 'live' ? 'Live Recording' : 'Video Analysis'}
                  </h1>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`flex items-center gap-1 ${connectionStatus === 'connected'
                        ? 'text-emerald-600'
                        : connectionStatus === 'connecting'
                          ? 'text-amber-600'
                          : 'text-red-600'
                        }`}
                    >
                      {connectionStatus === 'connected' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : connectionStatus === 'connecting' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {connectionStatus}
                    </span>
                    <span className="text-surface-300">•</span>
                    <span className="text-surface-500">Session: {sessionId?.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Timer */}
              <div className="px-4 py-2 bg-surface-100 rounded-xl font-mono text-lg font-medium text-surface-700">
                {formatTime(currentTime)}
                {mode === 'upload' && videoDuration > 0 && (
                  <span className="text-surface-400"> / {formatTime(videoDuration * 1000)}</span>
                )}
              </div>

              {/* Audio level indicator */}
              {(isRecording || isPlaying) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl">
                  <div className="pulse-dot" />
                  <div className="flex items-end gap-0.5 h-6">
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="w-1 bg-red-500 rounded-full"
                        animate={{
                          height: Math.max(4, audioLevel * (i + 1) * 8),
                        }}
                        transition={{ duration: 0.1 }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-xl transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
                <button className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-xl transition-colors">
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-surface-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                  title="Share session with professor"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Sidebar - Controls */}
        <aside className="w-20 bg-white border-r border-surface-200 flex flex-col items-center py-6 gap-4">
          {mode === 'live' ? (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={status === 'processing'}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isRecording
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                  : 'bg-gradient-primary text-white shadow-glow'
                  } disabled:opacity-50`}
              >
                {status === 'processing' ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-6 h-6" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </motion.button>
            </>
          ) : (
            <>
              {!videoUrl ? (
                <label className="w-14 h-14 rounded-2xl bg-gradient-primary text-white shadow-glow flex items-center justify-center cursor-pointer hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={status === 'idle' ? processVideo : togglePlayPause}
                  disabled={status === 'processing'}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isPlaying
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-gradient-primary text-white shadow-glow'
                    } disabled:opacity-50`}
                >
                  {status === 'processing' ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </motion.button>
              )}
            </>
          )}

          <div className="w-10 h-px bg-surface-200" />

          <button
            onClick={triggerAnalysis}
            disabled={transcript.length === 0 || isAnalyzing}
            className="w-12 h-12 rounded-xl bg-surface-100 text-surface-600 hover:bg-surface-200 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RotateCcw className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={triggerQuestionGeneration}
            disabled={!analysis || isGeneratingQuestions}
            className="w-12 h-12 rounded-xl bg-surface-100 text-surface-600 hover:bg-surface-200 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {isGeneratingQuestions ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </button>
        </aside>

        {/* Main panels */}
        <main className="flex-1 flex flex-col">
          {/* Welcome/Start prompt for live mode */}
          {mode === 'live' && status === 'idle' && !isRecording && (
            <div className="bg-gradient-to-br from-primary-500/5 to-accent-500/5 p-8">
              <div className="max-w-2xl mx-auto text-center">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-primary flex items-center justify-center shadow-glow"
                >
                  <Mic className="w-10 h-10 text-white" />
                </motion.div>
                <h2 className="text-2xl font-bold text-surface-900 mb-3">
                  Ready to Record
                </h2>
                <p className="text-surface-600 mb-6">
                  Click the microphone button on the left to start recording.
                  The AI will transcribe and analyze the presentation in real-time.
                </p>
                <div className="flex flex-wrap justify-center gap-4 text-sm text-surface-500">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Real-time transcription</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary-500" />
                    <span>AI analysis every 15s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-500" />
                    <span>Smart question generation</span>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startRecording}
                  className="mt-8 px-8 py-4 bg-gradient-primary text-white font-semibold rounded-2xl shadow-glow hover:shadow-lg transition-shadow"
                >
                  <Mic className="w-5 h-5 inline mr-2" />
                  Start Recording
                </motion.button>
              </div>
            </div>
          )}

          {/* Video player for upload mode */}
          {mode === 'upload' && (
            <div className="bg-surface-900 p-4">
              {!videoUrl ? (
                <div className="flex flex-col items-center justify-center py-12 text-surface-400">
                  <Video className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">No video selected</p>
                  <p className="text-sm mb-6">Select a video to analyze</p>
                  <label className="px-6 py-3 bg-gradient-primary text-white font-medium rounded-xl cursor-pointer hover:shadow-glow transition-shadow">
                    <Upload className="w-5 h-5 inline mr-2" />
                    Select Video File
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full max-h-72"
                      onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime * 1000)}
                      onEnded={async () => {
                        if (mediaRecorderRef.current) {
                          mediaRecorderRef.current.stop();
                        }
                        setIsPlaying(false);
                        setStatus('processing');
                        if (analysisIntervalRef.current) {
                          clearInterval(analysisIntervalRef.current);
                        }
                        await triggerAnalysis();
                        await generateRubric();
                        setStatus('completed');
                      }}
                    />
                    {status === 'idle' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={processVideo}
                          className="w-20 h-20 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl"
                        >
                          <Play className="w-10 h-10 text-primary-600 ml-1" />
                        </motion.button>
                      </div>
                    )}
                  </div>

                  {/* Video Controls */}
                  <div className="flex items-center gap-4 px-2">
                    {/* Play/Pause Button */}
                    <button
                      onClick={togglePlayPause}
                      disabled={status === 'idle' || status === 'processing'}
                      className="p-2 rounded-lg bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-50 transition-colors"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>

                    {/* Progress Bar */}
                    <div className="flex-1 relative">
                      <input
                        type="range"
                        min={0}
                        max={videoDuration || 100}
                        value={currentTime / 1000}
                        onChange={(e) => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = parseFloat(e.target.value);
                            setCurrentTime(parseFloat(e.target.value) * 1000);
                          }
                        }}
                        className="w-full h-2 bg-surface-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                    </div>

                    {/* Time Display */}
                    <span className="text-white text-sm font-mono min-w-[100px] text-right">
                      {formatTime(currentTime)} / {formatTime(videoDuration * 1000)}
                    </span>

                    {/* Change Video */}
                    <label className="p-2 rounded-lg bg-surface-800 text-white hover:bg-surface-700 cursor-pointer transition-colors">
                      <Upload className="w-5 h-5" />
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panel tabs */}
          <div className="bg-white border-b border-surface-200 px-6">
            <div className="flex gap-1">
              {panels.map((panel) => (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={`relative px-4 py-3 text-sm font-medium transition-colors ${activePanel === panel.id
                    ? 'text-primary-600'
                    : 'text-surface-500 hover:text-surface-700'
                    }`}
                >
                  {panel.label}
                  {activePanel === panel.id && (
                    <motion.div
                      layoutId="activePanel"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden bg-surface-50">
            <AnimatePresence mode="wait">
              {activePanel === 'transcript' && (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="h-full"
                >
                  <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                    <TranscriptFeed
                      segments={transcript}
                      isLive={isRecording || isPlaying}
                      currentTime={currentTime}
                      highlightKeywords={analysis?.keyClaims.flatMap((c) => c.claim.split(' ').slice(0, 3)) || []}
                    />
                  </div>
                </motion.div>
              )}

              {activePanel === 'analysis' && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="h-full"
                >
                  <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                    <SummaryCard analysis={analysis} isLoading={isAnalyzing} />
                  </div>
                </motion.div>
              )}

              {activePanel === 'questions' && (
                <motion.div
                  key="questions"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="h-full"
                >
                  <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                    <QuestionBank questions={questions} isLoading={isGeneratingQuestions} />
                  </div>
                </motion.div>
              )}

              {activePanel === 'rubric' && (
                <motion.div
                  key="rubric"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="h-full"
                >
                  <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                    <RubricCard rubric={rubric} isLoading={status === 'processing'} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Status bar */}
      <footer className="bg-white border-t border-surface-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-surface-500">
              Status:{' '}
              <span
                className={`font-medium ${status === 'recording'
                  ? 'text-red-600'
                  : status === 'completed'
                    ? 'text-emerald-600'
                    : status === 'processing'
                      ? 'text-amber-600'
                      : 'text-surface-600'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </span>
            <span className="text-surface-300">•</span>
            <span className="text-surface-500">
              {transcript.length} segments •{' '}
              {transcript.reduce((acc, s) => acc + s.text.split(' ').length, 0)} words
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-surface-500">
              Claims: {analysis?.keyClaims.length || 0}
            </span>
            <span className="text-surface-500">
              Questions:{' '}
              {questions.clarifying.length +
                questions.criticalThinking.length +
                questions.expansion.length}
            </span>
          </div>
        </div>
      </footer>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center">
                  <Link className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-surface-900">Share Session</h3>
                  <p className="text-sm text-surface-500">Let others watch this presentation live</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Shareable Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getShareLink()}
                    className="flex-1 px-4 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-700"
                  />
                  <button
                    onClick={copyShareLink}
                    className="px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-lg transition-shadow flex items-center gap-2"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-primary-50 rounded-xl p-4 mb-4">
                <h4 className="text-sm font-medium text-primary-700 mb-1">Real-Time Sync</h4>
                <p className="text-xs text-primary-600">
                  {pusherConnected
                    ? '✅ Anyone with this link will see transcript, questions, and analysis update in real-time!'
                    : '⚠️ Real-time sync requires Pusher configuration. Updates will still work but may require page refresh.'}
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-surface-600 hover:text-surface-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LiveDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    }>
      <LiveDashboardContent />
    </Suspense>
  );
}



