'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import NextLink from 'next/link';
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
  Monitor,
  Headphones,
  Presentation,
  FileImage,
  FolderOpen,
  UserPlus,
  Users,
  Save,
} from 'lucide-react';
import TranscriptFeed, { type MarkerHighlight } from '@/components/TranscriptFeed';
import { config } from '@/lib/config';
import QuestionBank from '@/components/QuestionBank';
import SummaryCard from '@/components/SummaryCard';
import RubricCard from '@/components/RubricCard';
import SlideUpload from '@/components/SlideUpload';
import VideoTimeline, { type TimelineMarker } from '@/components/VideoTimeline';
import QuestionSettings from '@/components/QuestionSettings';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import { usePusher } from '@/lib/hooks/usePusher';
import { useDeepgramStream } from '@/lib/hooks/useDeepgramStream';
import type {
  TranscriptSegment,
  AnalysisSummary,
  GeneratedQuestion,
  VerificationFinding,
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
  const [transcript, setTranscriptState] = useState<TranscriptSegment[]>([]);

  // Wrapper to log transcript changes
  const setTranscript: typeof setTranscriptState = useCallback((action) => {
    setTranscriptState((prev) => {
      const newValue = typeof action === 'function' ? action(prev) : action;
      console.log('[DEBUG] Transcript changing:', prev.length, '->', newValue.length, 'segments');
      if (newValue.length === 0 && prev.length > 0) {
        console.error('[DEBUG] TRANSCRIPT BEING CLEARED! Stack:', new Error().stack);
      }
      return newValue;
    });
  }, []);

  // Keep a ref to always have latest transcript (for debugging)
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [verificationFindings, setVerificationFindings] = useState<VerificationFinding[]>([]);
  const [questions, setQuestions] = useState<{
    clarifying: GeneratedQuestion[];
    criticalThinking: GeneratedQuestion[];
    expansion: GeneratedQuestion[];
  }>({ clarifying: [], criticalThinking: [], expansion: [] });
  const [rubric, setRubric] = useState<RubricEvaluation | null>(null);
  const [activePanel, setActivePanelState] = useState<ActivePanel>('transcript');

  // Wrapper to log panel changes
  const setActivePanel = useCallback((panel: ActivePanel) => {
    console.log('[DEBUG] Panel changing to:', panel);
    console.log('[DEBUG] Current transcript:', transcriptRef.current.length, 'segments');
    console.log('[DEBUG] Current questions:', questionsRef.current);
    setActivePanelState(panel);
    // Log state after a tick to see if it persists
    setTimeout(() => {
      console.log('[DEBUG] After panel change - transcript:', transcriptRef.current.length, 'questions:', questionsRef.current);
    }, 100);
  }, []);

  // Keep refs for questions too
  const questionsRef = useRef({ clarifying: 0, criticalThinking: 0, expansion: 0 });

  // Update questionsRef when questions change
  useEffect(() => {
    questionsRef.current = {
      clarifying: questions.clarifying.length,
      criticalThinking: questions.criticalThinking.length,
      expansion: questions.expansion.length,
    };
  }, [questions]);

  // Debug: Detect component mount/unmount
  useEffect(() => {
    console.log('[DEBUG] LiveDashboardContent MOUNTED');
    return () => {
      console.log('[DEBUG] LiveDashboardContent UNMOUNTING');
    };
  }, []);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  // Highlight toggles for transcript
  const [showQuestionHighlights, setShowQuestionHighlights] = useState(false);
  const [showIssueHighlights, setShowIssueHighlights] = useState(false);
  const [showInsightHighlights, setShowInsightHighlights] = useState(false);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [slideFile, setSlideFile] = useState<File | null>(null);
  const [slideAnalysis, setSlideAnalysis] = useState<{
    extractedText?: string;
    keyPoints?: string[];
    topics?: string[];
    imageCount?: number;
    visualElements?: string[];
    warning?: string;
  } | null>(null);
  const [showSlidesPanel, setShowSlidesPanel] = useState(false);
  const [timelineMarkers, setTimelineMarkers] = useState<TimelineMarker[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [audioSource, setAudioSource] = useState<'microphone' | 'system' | 'both'>('microphone');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [useStreamingTranscription, setUseStreamingTranscription] = useState(true);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [markerPopup, setMarkerPopup] = useState<{
    id: string;
    type: 'question' | 'issue' | 'insight';
    title: string;
    fullText: string;
    description?: string;
    timestamp: number;
  } | null>(null);

  // Camera and recording playback for live mode
  const [includeCamera, setIncludeCamera] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoDuration, setRecordedVideoDuration] = useState(0);
  const [recordedVideoTime, setRecordedVideoTime] = useState(0);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);

  // Audio-only recording playback (for live mode without camera)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioDuration, setRecordedAudioDuration] = useState(0);
  const [recordedAudioTime, setRecordedAudioTime] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const recordedAudioRef = useRef<HTMLAudioElement | null>(null);
  const fullAudioChunksRef = useRef<Blob[]>([]);

  // Live session batch for multi-student recording
  const [liveSessionBatchId, setLiveSessionBatchId] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<Array<{
    id: string;
    studentName: string;
    status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';
    duration: number;
    createdAt: number;
  }>>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [studentNameInput, setStudentNameInput] = useState('');
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [showRecordingsPanel, setShowRecordingsPanel] = useState(false);
  const currentRecordingBlobRef = useRef<Blob | null>(null);

  const lastWordCountRef = useRef<number>(0);
  const pendingQuestionGenRef = useRef<boolean>(false);
  const lastQuestionGenTimeRef = useRef<number>(0);

  // Question generation settings
  type QuestionSettingsState = {
    maxQuestions: number;
    assignmentContext: string;
    rubricCriteria: string;
    rubricTemplateId?: string;
    targetDifficulty?: 'mixed' | 'easy' | 'medium' | 'hard';
    bloomFocus?: 'mixed' | 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
    priorities: {
      clarifying: number; // 0 = none, 1 = some, 2 = focus
      criticalThinking: number;
      expansion: number;
    };
    focusAreas: string[];
  };
  const [showQuestionSettings, setShowQuestionSettings] = useState(false);
  const [questionSettings, setQuestionSettings] = useState<QuestionSettingsState>({
    maxQuestions: 10, // Hard cap
    assignmentContext: '', // Assignment prompt/description
    rubricCriteria: '', // Grading rubric/criteria
    rubricTemplateId: 'custom',
    targetDifficulty: 'mixed',
    bloomFocus: 'mixed',
    priorities: {
      clarifying: 1, // 0 = none, 1 = some, 2 = focus
      criticalThinking: 2,
      expansion: 1,
    },
    focusAreas: [] as string[], // Specific topics to focus on
  });

  // Candidate question pool (internal, not shown)
  const [candidateQuestions, setCandidateQuestions] = useState<GeneratedQuestion[]>([]);

  // Keep a ref for currentTime to avoid stale closures in callbacks
  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Async question generation - non-blocking (defined first to avoid hoisting issues)
  const triggerAsyncQuestionGeneration = useCallback(async (transcriptText: string) => {
    if (!sessionId) return;

    // Check throttle (configurable cooldown)
    const now = Date.now();
    if (now - lastQuestionGenTimeRef.current < config.timing.questionCooldownMs) {
      console.log('[Questions] Throttled, waiting for cooldown...');
      pendingQuestionGenRef.current = false;
      return;
    }

    // Check max questions cap
    const totalQuestions = questions.clarifying.length + questions.criticalThinking.length + questions.expansion.length;
    if (totalQuestions >= questionSettings.maxQuestions) {
      console.log('[Questions] Max questions reached:', totalQuestions);
      pendingQuestionGenRef.current = false;
      return;
    }

    lastQuestionGenTimeRef.current = now;
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

        // Add timeline markers for issues/gaps detected
        const issueMarkers: TimelineMarker[] = [];
        // Use actual video time or ref to avoid stale closure
        const capturedTime = mode === 'upload' && videoRef.current
          ? videoRef.current.currentTime * 1000
          : currentTimeRef.current;

        // Helper to find best snippet from transcript near a timestamp
        const findAnchorSnippet = (text: string, nearTime: number): string => {
          // Try to find the text in transcript, otherwise use nearest segment
          const textLower = text.toLowerCase();
          const matchingSegment = transcript.find(seg =>
            seg.text.toLowerCase().includes(textLower.slice(0, 30))
          );
          if (matchingSegment) {
            return matchingSegment.text.slice(0, 80);
          }
          // Fallback: nearest segment by time
          let best = transcript[0];
          let bestDelta = Infinity;
          for (const seg of transcript) {
            const delta = Math.abs((seg.timestamp || 0) - nearTime);
            if (delta < bestDelta) {
              best = seg;
              bestDelta = delta;
            }
          }
          return best?.text?.slice(0, 80) || '';
        };

        // Add markers for logical gaps
        analysisData.analysis.logicalGaps?.forEach((gap: { id: string; description: string; severity?: string; relevantSnippet?: string }) => {
          // Prefer Claude's relevantSnippet, fallback to search
          const snippet = (gap.relevantSnippet && gap.relevantSnippet.length >= 5)
            ? gap.relevantSnippet
            : findAnchorSnippet(gap.description, capturedTime);
          issueMarkers.push({
            id: `gap-${gap.id}`,
            timestamp: capturedTime,
            type: 'issue',
            title: gap.description.slice(0, 50) + (gap.description.length > 50 ? '...' : ''),
            fullText: gap.description,
            description: `Severity: ${gap.severity || 'moderate'}`,
            anchorSnippet: snippet,
          });
        });

        // Add markers for key claims (as insights)
        analysisData.analysis.keyClaims?.slice(0, config.limits.maxClaimMarkers).forEach((claim: { id: string; claim: string; evidence?: string; relevantSnippet?: string }) => {
          // Prefer Claude's relevantSnippet, fallback to search
          const snippet = (claim.relevantSnippet && claim.relevantSnippet.length >= 5)
            ? claim.relevantSnippet
            : findAnchorSnippet(claim.claim, capturedTime);
          issueMarkers.push({
            id: `claim-${claim.id}`,
            timestamp: capturedTime,
            type: 'insight',
            title: claim.claim.slice(0, 50) + (claim.claim.length > 50 ? '...' : ''),
            fullText: claim.claim,
            description: 'Key claim identified',
            anchorSnippet: snippet,
          });
        });

        // Add markers for missing evidence
        analysisData.analysis.missingEvidence?.forEach((evidence: { id: string; description: string; importance?: string; relevantSnippet?: string }) => {
          // Prefer Claude's relevantSnippet, fallback to search
          const snippet = (evidence.relevantSnippet && evidence.relevantSnippet.length >= 5)
            ? evidence.relevantSnippet
            : findAnchorSnippet(evidence.description, capturedTime);
          issueMarkers.push({
            id: `evidence-${evidence.id}`,
            timestamp: capturedTime,
            type: 'issue',
            title: evidence.description.slice(0, 50) + (evidence.description.length > 50 ? '...' : ''),
            fullText: evidence.description,
            description: `Missing evidence (${evidence.importance || 'medium'} importance)`,
            anchorSnippet: snippet,
          });
        });

        if (issueMarkers.length > 0) {
          setTimelineMarkers(prev => {
            // Avoid duplicate markers
            const existingIds = new Set(prev.map(m => m.id));
            const newMarkers = issueMarkers.filter(m => !existingIds.has(m.id));
            return [...prev, ...newMarkers];
          });
        }

        // Verification: flag factual claims that may be incorrect or need source checking
        try {
          const verifyResponse = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: transcriptText,
              claims: (analysisData.analysis.keyClaims || []).map((c: { claim: string }) => c.claim),
            }),
          });
          const verifyData = await verifyResponse.json();
          if (Array.isArray(verifyData.findings)) {
            setVerificationFindings(verifyData.findings);

            // Add timeline markers for verification findings
            const verifyMarkers: TimelineMarker[] = verifyData.findings.map((f: VerificationFinding) => {
              let markerTimestamp = capturedTime;
              let anchorSnippet = f.relevantSnippet || f.statement.slice(0, 80);

              // Anchor to snippet if available
              if (f.relevantSnippet && f.relevantSnippet.length > 5) {
                const snippetLower = f.relevantSnippet.toLowerCase();
                const matchingSegment = transcript.find(seg => seg.text.toLowerCase().includes(snippetLower));
                if (matchingSegment && matchingSegment.timestamp > 0) {
                  markerTimestamp = matchingSegment.timestamp;
                  anchorSnippet = matchingSegment.text.slice(0, 80);
                }
              }

              return {
                id: `verify-${f.id}`,
                timestamp: markerTimestamp,
                type: 'issue' as const,
                title: `Verify: ${f.statement.slice(0, 50)}${f.statement.length > 50 ? '...' : ''}`,
                fullText: f.statement,
                description: `${f.verdict} - ${f.explanation || 'Needs verification'}`,
                anchorSnippet,
              };
            });

            if (verifyMarkers.length > 0) {
              setTimelineMarkers(prev => {
                const existing = new Set(prev.map(m => m.id));
                const newOnes = verifyMarkers.filter(m => !existing.has(m.id));
                return [...prev, ...newOnes];
              });
            }
          }
        } catch (e) {
          console.error('[Verify] Failed:', e);
        }

        // Then trigger question generation with slide context and settings
        const questionsResponse = await fetch('/api/generate-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            context: {
              transcript: transcriptText,
              claims: analysisData.analysis.keyClaims,
              gaps: analysisData.analysis.logicalGaps,
              slideContent: slideAnalysis ? {
                text: slideAnalysis.extractedText,
                keyPoints: slideAnalysis.keyPoints,
                topics: slideAnalysis.topics,
              } : undefined,
            },
            settings: {
              maxQuestions: questionSettings.maxQuestions,
              remainingQuestions: Math.max(
                0,
                questionSettings.maxQuestions -
                (questions.clarifying.length + questions.criticalThinking.length + questions.expansion.length)
              ),
              assignmentContext: questionSettings.assignmentContext,
              rubricCriteria: questionSettings.rubricCriteria,
              rubricTemplateId: questionSettings.rubricTemplateId,
              targetDifficulty: questionSettings.targetDifficulty,
              bloomFocus: questionSettings.bloomFocus,
              priorities: questionSettings.priorities,
              focusAreas: questionSettings.focusAreas,
              existingQuestions: [
                ...questions.clarifying,
                ...questions.criticalThinking,
                ...questions.expansion,
              ].map(q => q.question),
            },
          }),
        });
        const questionsData = await questionsResponse.json();

        if (questionsData.questions && Array.isArray(questionsData.questions)) {
          // Use actual video time or ref to avoid stale closure
          const currentVideoTime = mode === 'upload' && videoRef.current
            ? videoRef.current.currentTime * 1000
            : currentTimeRef.current;

          // First, update questions state
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

          // Then, separately add timeline markers for new questions
          // Try to find the timestamp based on relevantSnippet from Claude
          const questionMarkers: TimelineMarker[] = questionsData.questions.map((q: GeneratedQuestion) => {
            let markerTimestamp = currentVideoTime;
            let anchorSnippet = q.relevantSnippet || '';

            // If question has a relevantSnippet, find it in transcript to get accurate timestamp
            if (q.relevantSnippet && q.relevantSnippet.length > 5) {
              const snippetLower = q.relevantSnippet.toLowerCase();
              // Search through transcript segments to find the matching one
              const matchingSegment = transcript.find(seg =>
                seg.text.toLowerCase().includes(snippetLower)
              );
              if (matchingSegment && matchingSegment.timestamp > 0) {
                markerTimestamp = matchingSegment.timestamp;
                anchorSnippet = matchingSegment.text.slice(0, 80);
                console.log(`[Markers] Found snippet "${q.relevantSnippet.slice(0, 30)}..." at ${markerTimestamp}ms`);
              }
            } else {
              // Fallback: use nearest segment text
              let best = transcript[0];
              let bestDelta = Infinity;
              for (const seg of transcript) {
                const delta = Math.abs((seg.timestamp || 0) - markerTimestamp);
                if (delta < bestDelta) {
                  best = seg;
                  bestDelta = delta;
                }
              }
              if (best) {
                anchorSnippet = best.text.slice(0, 80);
              }
            }

            return {
              id: `q-${q.id}`,
              timestamp: markerTimestamp,
              type: 'question' as const,
              title: q.question.slice(0, 60) + (q.question.length > 60 ? '...' : ''),
              fullText: q.question,
              description: q.rationale,
              category: q.category,
              anchorSnippet,
            };
          });

          if (questionMarkers.length > 0) {
            setTimelineMarkers(prev => {
              // Avoid duplicate markers
              const existingIds = new Set(prev.map(m => m.id));
              const newMarkers = questionMarkers.filter(m => !existingIds.has(m.id));
              return [...prev, ...newMarkers];
            });
          }
        }
      }
    } catch (e) {
      console.error('[Questions] Generation failed:', e);
    } finally {
      pendingQuestionGenRef.current = false;
    }
  }, [sessionId, slideAnalysis]);

  // Deepgram streaming callbacks for real-time transcription
  const handleFinalTranscript = useCallback((text: string) => {
    if (!text.trim()) return;

    // Ensure we have a start time for elapsed timestamps (important for live)
    if (!startTimeRef.current || startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    // Use consistent timestamps (ms) for both modes:
    // - upload: current video time (ms)
    // - live: elapsed time since start (ms)
    const segmentTimestampMs =
      mode === 'upload' && videoRef.current
        ? videoRef.current.currentTime * 1000
        : Date.now() - startTimeRef.current;

    const segment: TranscriptSegment = {
      id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: text.trim(),
      timestamp: segmentTimestampMs,
      duration: 0,
      isFinal: true,
    };

    // Clear interim and add to permanent transcript
    setInterimTranscript('');
    setTranscript((prev) => {
      // Avoid duplicates
      const segmentText = text.trim().toLowerCase();
      if (prev.some(s => s.text.trim().toLowerCase() === segmentText)) {
        return prev;
      }

      const newTranscript = [...prev, segment];

      // Trigger question generation
      const totalWords = newTranscript.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);
      const wordsSinceLastAnalysis = totalWords - lastWordCountRef.current;

      if (wordsSinceLastAnalysis >= config.limits.wordsBetweenAnalysis && !pendingQuestionGenRef.current && sessionId) {
        lastWordCountRef.current = totalWords;
        pendingQuestionGenRef.current = true;
        const fullText = newTranscript.map(s => s.text).join(' ');
        triggerAsyncQuestionGeneration(fullText);
      }

      return newTranscript;
    });
  }, [sessionId, triggerAsyncQuestionGeneration]);

  const handleInterimTranscript = useCallback((text: string) => {
    setInterimTranscript(text);
  }, []);

  const handleStreamError = useCallback((error: string) => {
    console.error('[Deepgram Stream] Error:', error);
    // Fall back to batch transcription
    setUseStreamingTranscription(false);
  }, []);

  const deepgramStream = useDeepgramStream({
    onFinalTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
    onError: handleStreamError,
  });

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
      if (newTranscript.length > config.limits.maxTranscriptSegments) {
        // Merge older segments into fewer chunks
        const olderSegments = newTranscript.slice(0, -config.limits.recentSegmentsToKeep);
        const recentSegments = newTranscript.slice(-config.limits.recentSegmentsToKeep);
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

      // Trigger question generation every N words (non-blocking)
      if (wordsSinceLastAnalysis >= config.limits.wordsBetweenAnalysis && !pendingQuestionGenRef.current) {
        lastWordCountRef.current = totalWords;
        pendingQuestionGenRef.current = true;

        // Async question generation - don't block transcript updates
        const fullText = newTranscript.map(s => s.text).join(' ');
        triggerAsyncQuestionGeneration(fullText);
      }

      return newTranscript;
    });
  }, [triggerAsyncQuestionGeneration]);

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

  // Process video - extract audio and stream to Deepgram for real-time transcription
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

      // Create destination for streaming to Deepgram
      const destination = audioContextRef.current.createMediaStreamDestination();

      // Connect: source -> analyser -> destination (for Deepgram)
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination); // So we can hear it
      source.connect(destination);

      console.log('[Video] Audio context set up, connecting to Deepgram streaming...');

      startTimeRef.current = Date.now();
      setCurrentTime(0);

      // Connect to Deepgram streaming for real-time transcription
      const connected = await deepgramStream.connect(destination.stream);

      if (!connected) {
        console.error('[Video] Failed to connect to Deepgram streaming');
        alert('Failed to connect to transcription service. Please check your API key.');
        return;
      }

      console.log('[Video] Deepgram streaming connected - real-time transcription enabled');

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
        console.log('[Video] Video ended, disconnecting Deepgram...');
        deepgramStream.disconnect();
        setIsPlaying(false);
        setStatus('processing');

        if (analysisIntervalRef.current) {
          clearInterval(analysisIntervalRef.current);
        }

        // Final analysis and rubric
        await triggerAnalysis();
        await generateRubric();

        setStatus('completed');
      };

      // Handle video pause - pause Deepgram streaming
      video.onpause = () => {
        if (!video.ended) {
          console.log('[Video] Video paused');
          // Note: Deepgram WebSocket stays connected, we just stop sending audio
        }
      };

      // Handle video play/resume
      video.onplay = () => {
        console.log('[Video] Video playing/resumed');
      };

    } catch (error) {
      console.error('Failed to process video:', error);
      alert('Failed to process video: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Pause/Resume video
  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Start live recording
  const startRecording = async () => {
    try {
      let stream: MediaStream;

      if (audioSource === 'both') {
        // Capture BOTH microphone AND system audio
        console.log('[Live] Requesting both microphone and system audio...');

        // Get microphone stream
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[Live] Microphone stream obtained');

        // Get system audio stream
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        // Stop video track
        displayStream.getVideoTracks().forEach(track => track.stop());

        if (displayStream.getAudioTracks().length === 0) {
          micStream.getTracks().forEach(track => track.stop());
          alert('No system audio detected. Make sure to check "Share audio" when selecting what to share.');
          return;
        }
        console.log('[Live] System audio stream obtained');

        // Mix both audio streams using AudioContext
        const audioContext = new AudioContext();
        const micSource = audioContext.createMediaStreamSource(micStream);
        const systemSource = audioContext.createMediaStreamSource(displayStream);

        // Create a destination to mix both streams
        const destination = audioContext.createMediaStreamDestination();

        // Connect both sources to the destination
        micSource.connect(destination);
        systemSource.connect(destination);

        // Use the mixed stream
        stream = destination.stream;

        // Store original streams for cleanup
        streamRef.current = stream;
        // Store extra streams in a custom property for cleanup
        (streamRef as any).micStream = micStream;
        (streamRef as any).displayStream = displayStream;

        console.log('[Live] Mixed audio stream created');

      } else if (audioSource === 'system') {
        // Capture system audio via screen sharing
        // User will be prompted to share a screen/window/tab and must check "Share audio"
        console.log('[Live] Requesting system audio via getDisplayMedia...');
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // Required, but we only use audio
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        console.log('[Live] Display stream obtained, video tracks:', displayStream.getVideoTracks().length, 'audio tracks:', displayStream.getAudioTracks().length);

        // Check if audio track was shared BEFORE stopping video
        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getVideoTracks().forEach(track => track.stop());
          alert('No audio track detected. Make sure to check "Share audio" or "Share system audio" when selecting what to share.');
          return;
        }

        // For system audio, we need to use AudioContext to extract the audio
        // because some browsers have issues with the raw display media audio track
        const tempAudioContext = new AudioContext();
        const systemSource = tempAudioContext.createMediaStreamSource(displayStream);
        const destination = tempAudioContext.createMediaStreamDestination();
        systemSource.connect(destination);

        // Use the destination stream which has proper audio
        stream = destination.stream;

        // Store the original display stream for cleanup
        (streamRef as any).displayStream = displayStream;

        // Stop video track after we've set up audio routing
        displayStream.getVideoTracks().forEach(track => track.stop());

        const audioTrack = stream.getAudioTracks()[0];
        console.log('[Live] System audio stream created via AudioContext');
        console.log('[Live] Audio track settings:', audioTrack?.getSettings());
        console.log('[Live] Audio track enabled:', audioTrack?.enabled, 'readyState:', audioTrack?.readyState);
      } else {
        // Standard microphone capture
        console.log('[Live] Requesting microphone audio...');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;

      // Capture camera video if enabled
      let combinedStream = stream;
      if (includeCamera) {
        try {
          console.log('[Live] Requesting camera...');
          const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: false // Audio already captured separately
          });
          cameraStreamRef.current = cameraStream;

          // Show camera preview
          if (cameraPreviewRef.current) {
            cameraPreviewRef.current.srcObject = cameraStream;
            cameraPreviewRef.current.play();
          }

          // Combine camera video with audio
          const videoTrack = cameraStream.getVideoTracks()[0];
          const audioTracks = stream.getAudioTracks();
          combinedStream = new MediaStream([videoTrack, ...audioTracks]);

          console.log('[Live] Camera stream obtained and combined with audio');

          // Set up video recording
          const videoMimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm')
              ? 'video/webm'
              : 'video/mp4';

          const videoRecorder = new MediaRecorder(combinedStream, { mimeType: videoMimeType });
          videoRecorderRef.current = videoRecorder;

          videoRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };

          videoRecorder.onstop = () => {
            if (recordedChunksRef.current.length > 0) {
              const blob = new Blob(recordedChunksRef.current, { type: videoMimeType });
              const url = URL.createObjectURL(blob);
              setRecordedVideoUrl(url);
              console.log('[Live] Recording saved, URL created');
            }
          };

          videoRecorder.start(1000); // Collect chunks every second
          console.log('[Live] Video recording started');

        } catch (e) {
          console.error('[Live] Camera error:', e);
          alert('Failed to access camera. Continuing with audio only.');
        }
      }

      // Set up audio context for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Try to connect to Deepgram for real-time streaming transcription
      if (useStreamingTranscription) {
        console.log('[Live] Connecting to Deepgram streaming...');
        const connected = await deepgramStream.connect(stream);
        if (connected) {
          console.log('[Live] Deepgram streaming connected - real-time transcription enabled');
          startTimeRef.current = Date.now(); // Initialize timer
          setCurrentTime(0); // Reset timer display
          setIsRecording(true);
          setStatus('recording');
          updateAudioLevel();

          // Start periodic analysis (questions still need batched transcript)
          analysisIntervalRef.current = setInterval(() => {
            const now = Date.now();
            if (now - lastAnalysisTimeRef.current >= 15000 && transcript.length > 0) {
              triggerAnalysis();
              lastAnalysisTimeRef.current = now;
            }
          }, 5000);

          return; // Using streaming, skip batch setup
        } else {
          console.log('[Live] Deepgram streaming failed, falling back to batch transcription');
          setUseStreamingTranscription(false);
        }
      }

      // Fallback: Batch transcription setup
      console.log('[Live] Using batch transcription mode');

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
        console.log(`[Live] ondataavailable fired, size: ${event.data.size} bytes`);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Also save to full recording for playback
          fullAudioChunksRef.current.push(event.data);
          console.log(`[Live] Audio chunk added: ${event.data.size} bytes, type: ${event.data.type}, total chunks: ${audioChunksRef.current.length}`);
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

      // Stop and restart recorder every 4 seconds for near real-time transcription
      sendAudioIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log('[Live] Stopping recorder for segment...');
          mediaRecorderRef.current.stop();
        }
      }, 4000);

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setStatus('recording');

      console.log('[Live] Recording started!');
      console.log('[Live] MediaRecorder state:', mediaRecorder.state);
      console.log('[Live] Stream active:', stream.active);
      console.log('[Live] Audio tracks:', stream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, label: t.label })));
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
    // Disconnect Deepgram streaming if active
    if (deepgramStream.isConnected) {
      console.log('[Live] Disconnecting Deepgram stream...');
      deepgramStream.disconnect();
      setInterimTranscript('');
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop video recorder if active
    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      console.log('[Live] Stopping video recorder...');
      videoRecorderRef.current.stop();
    }

    // Create audio-only recording URL for playback (when camera is off)
    if (fullAudioChunksRef.current.length > 0 && !includeCamera) {
      const audioMime = fullAudioChunksRef.current[0]?.type || 'audio/webm';
      const audioBlob = new Blob(fullAudioChunksRef.current, { type: audioMime });
      const audioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(audioUrl);
      console.log('[Live] Audio recording saved for playback:', audioBlob.size, 'bytes');
    }
    fullAudioChunksRef.current = [];

    // Stop camera stream
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }

    // Clear camera preview
    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = null;
    }

    if (isRecording) {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      // Clean up extra streams from 'both' mode
      const streamRefAny = streamRef as any;
      if (streamRefAny.micStream) {
        streamRefAny.micStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        streamRefAny.micStream = null;
      }
      if (streamRefAny.displayStream) {
        streamRefAny.displayStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        streamRefAny.displayStream = null;
      }

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

  // Create or get live session batch for multi-student recording
  const ensureLiveSessionBatch = useCallback(async (): Promise<string> => {
    if (liveSessionBatchId) return liveSessionBatchId;

    try {
      const res = await fetch('/api/bulk/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Live Session - ${new Date().toLocaleDateString()}`,
          courseName: 'Live Recording',
          assignmentName: 'Oral Presentations',
        }),
      });
      const data = await res.json();
      if (data.success && data.batch?.id) {
        setLiveSessionBatchId(data.batch.id);
        return data.batch.id;
      }
      throw new Error('Failed to create batch');
    } catch (e) {
      console.error('[Live] Failed to create session batch:', e);
      throw e;
    }
  }, [liveSessionBatchId]);

  // Save current recording and reset for next student
  const saveRecordingAndReset = useCallback(async (studentName: string) => {
    if (!studentName.trim()) return;

    setIsSavingRecording(true);
    const recordingDuration = currentTime;

    try {
      // 1. Get or create batch
      const batchId = await ensureLiveSessionBatch();

      // 2. Collect the recording blob
      let recordingBlob: Blob | null = null;
      let mimeType = 'audio/webm';

      if (includeCamera && recordedChunksRef.current.length > 0) {
        // Video recording
        mimeType = recordedChunksRef.current[0]?.type || 'video/webm';
        recordingBlob = new Blob(recordedChunksRef.current, { type: mimeType });
      } else if (fullAudioChunksRef.current.length > 0) {
        // Audio-only recording
        mimeType = fullAudioChunksRef.current[0]?.type || 'audio/webm';
        recordingBlob = new Blob(fullAudioChunksRef.current, { type: mimeType });
      }

      if (!recordingBlob || recordingBlob.size < 1000) {
        throw new Error('No recording data available');
      }

      // 3. Stop recording streams (but don't trigger normal analysis)
      if (deepgramStream.isConnected) {
        deepgramStream.disconnect();
        setInterimTranscript('');
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
        videoRecorderRef.current.stop();
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraPreviewRef.current) {
        cameraPreviewRef.current.srcObject = null;
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      audioContextRef.current?.close();
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      if (sendAudioIntervalRef.current) clearInterval(sendAudioIntervalRef.current);

      // 4. Add to saved recordings list (optimistic)
      const tempId = `temp-${Date.now()}`;
      setSavedRecordings(prev => [...prev, {
        id: tempId,
        studentName,
        status: 'uploading',
        duration: recordingDuration,
        createdAt: Date.now(),
      }]);

      // 5. Get presigned URL and upload to R2
      const filename = `${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.webm`;
      const presignRes = await fetch('/api/bulk/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, filename, contentType: mimeType }),
      });
      const presignData = await presignRes.json();

      if (!presignData.success) {
        throw new Error(presignData.error || 'Failed to get upload URL');
      }

      // Upload to R2
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: recordingBlob,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      // 6. Enqueue for processing
      const enqueueRes = await fetch('/api/bulk/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          submissionId: presignData.submissionId,
          fileKey: presignData.fileKey,
          originalFilename: filename,
          fileSize: recordingBlob.size,
          mimeType,
          studentName,
        }),
      });
      const enqueueData = await enqueueRes.json();

      if (!enqueueData.success) {
        throw new Error('Failed to enqueue');
      }

      // Update saved recording with real ID and status
      setSavedRecordings(prev => prev.map(r =>
        r.id === tempId ? { ...r, id: enqueueData.submission?.id || tempId, status: 'queued' } : r
      ));

      // Processing will start when user clicks "Process Now" or via external cron

      // 8. Reset state for next student
      setIsRecording(false);
      setStatus('idle');
      setTranscript([]);
      setAnalysis(null);
      setQuestions({ clarifying: [], criticalThinking: [], expansion: [] });
      setRubric(null);
      setTimelineMarkers([]);
      setVerificationFindings([]);
      setCurrentTime(0);
      setRecordedVideoUrl(null);
      setRecordedAudioUrl(null);
      audioChunksRef.current = [];
      fullAudioChunksRef.current = [];
      recordedChunksRef.current = [];

      console.log(`[Live] Saved recording for ${studentName}, ready for next student`);

    } catch (e) {
      console.error('[Live] Failed to save recording:', e);
      // Mark as failed
      setSavedRecordings(prev => prev.map(r =>
        r.status === 'uploading' ? { ...r, status: 'failed' } : r
      ));
    } finally {
      setIsSavingRecording(false);
      setShowSaveModal(false);
      setStudentNameInput('');
    }
  }, [currentTime, includeCamera, deepgramStream, ensureLiveSessionBatch, setTranscript]);

  // Poll for saved recordings status updates
  useEffect(() => {
    if (savedRecordings.length === 0 || !liveSessionBatchId) return;

    const processingRecordings = savedRecordings.filter(r => 
      r.status === 'queued' || r.status === 'processing'
    );
    if (processingRecordings.length === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk/status?batchId=${liveSessionBatchId}`);
        const data = await res.json();
        if (data.success && data.submissions) {
          setSavedRecordings(prev => prev.map(r => {
            const serverSub = data.submissions.find((s: { id: string; status: string }) => s.id === r.id);
            if (serverSub) {
              return { ...r, status: serverSub.status };
            }
            return r;
          }));
        }
      } catch (e) {
        console.error('[Live] Failed to poll status:', e);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [savedRecordings, liveSessionBatchId]);

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

  // Generate rubric using custom rubric criteria if provided
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
          // Pass the custom rubric from settings (if user provided one)
          customRubric: questionSettings.rubricCriteria || undefined,
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

  // Handle marker selection from SummaryCard/QuestionBank/transcript highlights
  const handleSelectMarker = useCallback((markerId: string) => {
    // Find the marker by ID
    const marker = timelineMarkers.find(m => m.id === markerId);

    if (marker) {
      // Seek video to marker timestamp
      if (mode === 'upload' && videoRef.current) {
        videoRef.current.currentTime = marker.timestamp / 1000;
        setCurrentTime(marker.timestamp);
      } else if (mode === 'live' && recordedVideoRef.current) {
        recordedVideoRef.current.currentTime = marker.timestamp / 1000;
        setRecordedVideoTime(marker.timestamp);
      }

      // Highlight the marker
      setSelectedMarkerId(markerId);

      // Show popup with full details
      setMarkerPopup({
        id: marker.id,
        type: marker.type,
        title: marker.title,
        fullText: marker.fullText || marker.title,
        description: marker.description,
        timestamp: marker.timestamp,
      });

      // Auto-clear selection after configured time (but keep popup open)
      setTimeout(() => setSelectedMarkerId(null), config.timing.markerSelectionClearMs);

      console.log('[Marker] Selected:', markerId, 'at', marker.timestamp, 'ms');
    } else {
      console.log('[Marker] Not found:', markerId);
    }
  }, [timelineMarkers, mode]);

  // Timer for live recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      // Ensure startTimeRef is set
      if (!startTimeRef.current || startTimeRef.current === 0) {
        startTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        // Sanity check - if elapsed time is negative or more than 24 hours, something is wrong
        if (elapsed >= 0 && elapsed < 86400000) {
          setCurrentTime(elapsed);
        }
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

  // Keyboard controls for video
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Only handle when in video/upload mode
      if (mode !== 'upload' || !videoRef.current) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.max(0, videoRef.current.currentTime - 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime * 1000);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.min(videoDuration, videoRef.current.currentTime + 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime * 1000);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.max(0, videoRef.current.currentTime - 10);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime * 1000);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.min(videoDuration, videoRef.current.currentTime + 10);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime * 1000);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, videoDuration, togglePlayPause]);

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
                {/* Bulk Upload - only show in upload mode */}
                {mode === 'upload' && (
                  <NextLink
                    href="/bulk"
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-colors text-sm font-medium"
                    title="Bulk Upload - Grade multiple presentations"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Bulk Upload</span>
                  </NextLink>
                )}
                <button
                  onClick={() => setShowQuestionSettings(true)}
                  className="p-2 text-surface-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                  title="Question Settings"
                >
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
                disabled={status === 'processing' || isSavingRecording}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isRecording
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                  : 'bg-gradient-primary text-white shadow-glow'
                  } disabled:opacity-50`}
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                {status === 'processing' ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-6 h-6" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </motion.button>

              {/* Save & Next Student button - only show when recording */}
              {isRecording && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowSaveModal(true)}
                  disabled={isSavingRecording || currentTime < 5000}
                  className="w-14 h-14 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all disabled:opacity-50"
                  title="Save & Next Student"
                >
                  {isSavingRecording ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <UserPlus className="w-6 h-6" />
                  )}
                </motion.button>
              )}

              {/* Today's Recordings counter */}
              {savedRecordings.length > 0 && (
                <button
                  onClick={() => setShowRecordingsPanel(!showRecordingsPanel)}
                  className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    showRecordingsPanel 
                      ? 'bg-primary-100 text-primary-600' 
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}
                  title={`Today's Recordings (${savedRecordings.length})`}
                >
                  <Users className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {savedRecordings.length}
                  </span>
                </button>
              )}
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
            title="Generate questions"
          >
            {isGeneratingQuestions ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </button>

          <div className="w-10 h-px bg-surface-200" />

          {/* Slides upload button */}
          <button
            onClick={() => setShowSlidesPanel(!showSlidesPanel)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${slideFile
              ? 'bg-emerald-100 text-emerald-600'
              : showSlidesPanel
                ? 'bg-primary-100 text-primary-600'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            title={slideFile ? 'Slides uploaded' : 'Upload slides'}
          >
            <Presentation className="w-5 h-5" />
          </button>
        </aside>

        {/* Slides Panel (collapsible) */}
        <AnimatePresence>
          {showSlidesPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-white border-r border-surface-200 overflow-hidden"
            >
              <div className="p-4 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-surface-900">Presentation Slides</h3>
                  <button
                    onClick={() => setShowSlidesPanel(false)}
                    className="p-1 text-surface-400 hover:text-surface-600"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>
                <SlideUpload
                  selectedFile={slideFile}
                  onFileSelect={setSlideFile}
                  onAnalysisComplete={(data: unknown) => {
                    const analysisData = data as { analysis?: typeof slideAnalysis };
                    if (analysisData?.analysis) {
                      setSlideAnalysis(analysisData.analysis);
                    }
                  }}
                />
                {slideAnalysis && (
                  <div className="mt-4 p-3 bg-emerald-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-emerald-700">✓ Slides analyzed</p>
                      {slideAnalysis.imageCount !== undefined && slideAnalysis.imageCount > 0 && (
                        <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                          {slideAnalysis.imageCount} images
                        </span>
                      )}
                    </div>
                    {slideAnalysis.warning && (
                      <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mb-2">
                        ⚠️ {slideAnalysis.warning}
                      </p>
                    )}
                    {slideAnalysis.keyPoints && slideAnalysis.keyPoints.length > 0 && (
                      <div className="text-xs text-emerald-600">
                        <p className="font-medium">Key points detected:</p>
                        <ul className="list-disc list-inside mt-1">
                          {slideAnalysis.keyPoints.slice(0, 3).map((point, i) => (
                            <li key={i} className="truncate">{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {slideAnalysis.visualElements && slideAnalysis.visualElements.length > 0 && (
                      <div className="text-xs text-emerald-600 mt-2">
                        <p className="font-medium">Visual content detected:</p>
                        <ul className="list-disc list-inside mt-1">
                          {slideAnalysis.visualElements.slice(0, 2).map((elem, i) => (
                            <li key={i} className="truncate">{elem}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

                {/* Audio Source Selector */}
                <div className="mt-8 mb-4">
                  <p className="text-sm text-surface-500 mb-3">Select audio source:</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={() => setAudioSource('microphone')}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${audioSource === 'microphone'
                        ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                        : 'border-surface-200 text-surface-600 hover:border-surface-300'
                        }`}
                    >
                      <Mic className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">Microphone</div>
                        <div className="text-xs opacity-70">Your voice only</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setAudioSource('system')}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${audioSource === 'system'
                        ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                        : 'border-surface-200 text-surface-600 hover:border-surface-300'
                        }`}
                    >
                      <Monitor className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">System Audio</div>
                        <div className="text-xs opacity-70">Zoom, Teams, etc.</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setAudioSource('both')}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${audioSource === 'both'
                        ? 'border-accent-500 bg-accent-500/10 text-accent-600'
                        : 'border-surface-200 text-surface-600 hover:border-surface-300'
                        }`}
                    >
                      <Headphones className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">Both</div>
                        <div className="text-xs opacity-70">Mic + System</div>
                      </div>
                    </button>
                  </div>
                  {(audioSource === 'system' || audioSource === 'both') && (
                    <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg max-w-md mx-auto">
                      💡 When prompted, select your Zoom/Teams/ChatGPT window and check &quot;Share audio&quot;
                      {audioSource === 'both' && ' — Your mic will also be recorded!'}
                    </p>
                  )}
                </div>

                {/* Camera Toggle */}
                <div className="mb-6">
                  <button
                    onClick={() => setIncludeCamera(!includeCamera)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all mx-auto ${includeCamera
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300'
                      }`}
                  >
                    <Video className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">Include Camera</div>
                      <div className="text-xs opacity-70">{includeCamera ? 'Camera ON - Recording video' : 'Click to enable webcam'}</div>
                    </div>
                  </button>
                  {includeCamera && (
                    <p className="mt-2 text-xs text-primary-600 bg-primary-50 px-3 py-2 rounded-lg max-w-md mx-auto">
                      📹 Your webcam will be recorded. You can play back the video after the session!
                    </p>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startRecording}
                  className="px-8 py-4 bg-gradient-primary text-white font-semibold rounded-2xl shadow-glow hover:shadow-lg transition-shadow"
                >
                  {audioSource === 'both' ? (
                    <>
                      <Headphones className="w-5 h-5 inline mr-2" />
                      Record Full Conversation
                    </>
                  ) : audioSource === 'system' ? (
                    <>
                      <Monitor className="w-5 h-5 inline mr-2" />
                      Capture System Audio
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5 inline mr-2" />
                      Start Recording
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          )}

          {/* Camera preview during live recording */}
          {mode === 'live' && isRecording && includeCamera && (
            <div className="bg-surface-900 p-4">
              <div className="max-w-md mx-auto">
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    ref={cameraPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full max-h-48 transform scale-x-[-1]"
                  />
                  <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full flex items-center gap-1">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    Recording
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recording playback for live mode (after recording ends) - VIDEO */}
          {mode === 'live' && status === 'completed' && recordedVideoUrl && (
            <div className="bg-surface-900 p-4">
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    ref={recordedVideoRef}
                    src={recordedVideoUrl}
                    className="w-full max-h-72"
                    onLoadedMetadata={(e) => setRecordedVideoDuration(e.currentTarget.duration)}
                    onTimeUpdate={(e) => setRecordedVideoTime(e.currentTarget.currentTime * 1000)}
                    onPlay={() => setIsPlayingRecording(true)}
                    onPause={() => setIsPlayingRecording(false)}
                  />
                </div>

                {/* Audio Player Bar for recorded video */}
                <AudioPlayerBar
                  isPlaying={isPlayingRecording}
                  currentTimeMs={recordedVideoTime}
                  durationMs={recordedVideoDuration * 1000}
                  onPlayPause={() => {
                    if (recordedVideoRef.current) {
                      if (isPlayingRecording) {
                        recordedVideoRef.current.pause();
                      } else {
                        recordedVideoRef.current.play();
                      }
                    }
                  }}
                  onSeek={(timeMs) => {
                    if (recordedVideoRef.current) {
                      recordedVideoRef.current.currentTime = timeMs / 1000;
                      setRecordedVideoTime(timeMs);
                    }
                  }}
                  audioRef={recordedVideoRef}
                  markers={timelineMarkers.map(m => ({ timestamp: m.timestamp, type: m.type }))}
                  showDownload
                  onDownload={() => {
                    if (recordedVideoUrl) {
                      const a = document.createElement('a');
                      a.href = recordedVideoUrl;
                      a.download = `babblet-recording-${new Date().toISOString().slice(0, 10)}.webm`;
                      a.click();
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Audio-only playback for live mode (when no camera) */}
          {mode === 'live' && status === 'completed' && recordedAudioUrl && !recordedVideoUrl && (
            <div className="bg-surface-900 p-4">
              <div className="space-y-3">
                {/* Hidden audio element */}
                <audio
                  ref={recordedAudioRef}
                  src={recordedAudioUrl}
                  onLoadedMetadata={(e) => setRecordedAudioDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setRecordedAudioTime(e.currentTarget.currentTime * 1000)}
                  onPlay={() => setIsPlayingAudio(true)}
                  onPause={() => setIsPlayingAudio(false)}
                />

                {/* Visual waveform placeholder */}
                <div className="relative rounded-xl overflow-hidden bg-gradient-to-r from-surface-800 to-surface-900 h-24 flex items-center justify-center">
                  <div className="flex items-end gap-1 h-16">
                    {[...Array(40)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 bg-gradient-to-t from-primary-500 to-accent-500 rounded-full"
                        animate={{
                          height: isPlayingAudio
                            ? `${20 + Math.sin((recordedAudioTime / 100) + i * 0.3) * 30 + Math.random() * 20}%`
                            : '30%',
                        }}
                        transition={{ duration: 0.1 }}
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-surface-400 text-sm font-medium">
                      {isPlayingAudio ? 'Playing...' : 'Audio Recording'}
                    </span>
                  </div>
                </div>

                {/* Audio Player Bar */}
                <AudioPlayerBar
                  isPlaying={isPlayingAudio}
                  currentTimeMs={recordedAudioTime}
                  durationMs={recordedAudioDuration * 1000}
                  onPlayPause={() => {
                    if (recordedAudioRef.current) {
                      if (isPlayingAudio) {
                        recordedAudioRef.current.pause();
                      } else {
                        recordedAudioRef.current.play();
                      }
                    }
                  }}
                  onSeek={(timeMs) => {
                    if (recordedAudioRef.current) {
                      recordedAudioRef.current.currentTime = timeMs / 1000;
                      setRecordedAudioTime(timeMs);
                    }
                  }}
                  audioRef={recordedAudioRef}
                  markers={timelineMarkers.map(m => ({ timestamp: m.timestamp, type: m.type }))}
                  showDownload
                  onDownload={() => {
                    if (recordedAudioUrl) {
                      const a = document.createElement('a');
                      a.href = recordedAudioUrl;
                      a.download = `babblet-recording-${new Date().toISOString().slice(0, 10)}.webm`;
                      a.click();
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Video player for upload mode */}
          {mode === 'upload' && (
            <div className="bg-surface-900 p-4">
              {!videoUrl ? (
                <div className="flex flex-col items-center justify-center py-12 text-surface-400">
                  <Video className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">Ready to Analyze</p>
                  <p className="text-sm mb-8">Upload a single video or batch process multiple student presentations</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Single Video Upload */}
                    <label className="flex flex-col items-center gap-3 px-8 py-6 bg-white border-2 border-surface-200 rounded-2xl cursor-pointer hover:border-primary-400 hover:shadow-lg transition-all group">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-primary text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="text-surface-900 font-semibold">Single Video</p>
                        <p className="text-xs text-surface-500">Analyze one presentation</p>
                      </div>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoUpload}
                        className="hidden"
                      />
                    </label>

                    {/* Bulk Upload */}
                    <NextLink 
                      href="/bulk"
                      className="flex flex-col items-center gap-3 px-8 py-6 bg-white border-2 border-surface-200 rounded-2xl hover:border-emerald-400 hover:shadow-lg transition-all group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FolderOpen className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="text-surface-900 font-semibold">Bulk Upload</p>
                        <p className="text-xs text-surface-500">Grade multiple at once</p>
                      </div>
                    </NextLink>
                  </div>
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

                    {/* Timeline with Markers */}
                    <div className="flex-1">
                      <VideoTimeline
                        currentTime={currentTime}
                        duration={videoDuration}
                        markers={timelineMarkers}
                        activeMarkerId={selectedMarkerId}
                        onSeek={(timeMs) => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = timeMs / 1000;
                            setCurrentTime(timeMs);
                          }
                        }}
                        onMarkerClick={(marker) => {
                          console.log('[Timeline] Marker clicked:', marker);
                          setSelectedMarkerId(marker.id);
                          // Auto-clear selection after 3 seconds
                          setTimeout(() => setSelectedMarkerId(null), 3000);
                        }}
                        onMarkerHover={(marker) => setHoveredMarkerId(marker?.id || null)}
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

                  {/* Audio Player Bar - sleek controls with speed/volume */}
                  <AudioPlayerBar
                    isPlaying={isPlaying}
                    currentTimeMs={currentTime}
                    durationMs={videoDuration * 1000}
                    onPlayPause={togglePlayPause}
                    onSeek={(timeMs) => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = timeMs / 1000;
                        setCurrentTime(timeMs);
                      }
                    }}
                    audioRef={videoRef}
                    markers={timelineMarkers.map(m => ({ timestamp: m.timestamp, type: m.type }))}
                    compact
                  />
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

          {/* Panel content - using simple conditional rendering for stability */}
          <div className="flex-1 overflow-hidden bg-surface-50">
            {/* Transcript Panel */}
            <div className={`h-full flex flex-col ${activePanel === 'transcript' ? '' : 'hidden'}`}>
              {/* Transcript toolbar - highlight toggles */}
              <div className="flex items-center justify-end px-4 pt-4 gap-2 flex-wrap">
                <span className="text-xs text-surface-400 mr-2">Highlights:</span>
                <button
                  onClick={() => setShowQuestionHighlights(!showQuestionHighlights)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${showQuestionHighlights
                    ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-300'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  title="Highlight where questions arose in the transcript"
                >
                  <span className="text-sm">❓</span>
                  Questions
                </button>
                <button
                  onClick={() => setShowIssueHighlights(!showIssueHighlights)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${showIssueHighlights
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  title="Highlight logical gaps and issues in the transcript"
                >
                  <span className="text-sm">⚠️</span>
                  Issues
                </button>
                <button
                  onClick={() => setShowInsightHighlights(!showInsightHighlights)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${showInsightHighlights
                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  title="Highlight key claims and insights in the transcript"
                >
                  <span className="text-sm">💡</span>
                  Insights
                </button>
              </div>
              <div className="flex-1 bg-white mx-4 mb-4 rounded-3xl shadow-soft overflow-hidden">
                <TranscriptFeed
                  segments={transcript}
                  isLive={isRecording || isPlaying}
                  currentTime={currentTime}
                  markerHighlights={timelineMarkers
                    .filter(m => m.anchorSnippet && m.anchorSnippet.length >= 5)
                    .map((m): MarkerHighlight => {
                      // Truncate overly long snippets using config
                      let snippet = m.anchorSnippet!;
                      const words = snippet.split(/\s+/);
                      if (words.length > config.limits.maxSnippetWords) {
                        // Take the most distinctive middle portion
                        const midStart = Math.floor((words.length - config.limits.truncatedSnippetWords) / 2);
                        snippet = words.slice(midStart, midStart + config.limits.truncatedSnippetWords).join(' ');
                      }
                      return {
                        id: m.id,
                        snippet,
                        label: m.title,
                        fullText: m.fullText,
                        type: m.type,
                      };
                    })}
                  showQuestions={showQuestionHighlights}
                  showIssues={showIssueHighlights}
                  showInsights={showInsightHighlights}
                  hoveredMarkerId={hoveredMarkerId}
                  onHighlightClick={(markerId) => {
                    handleSelectMarker(markerId);
                  }}
                  interimText={interimTranscript}
                />
              </div>
            </div>

            {/* Analysis Panel */}
            <div className={`h-full ${activePanel === 'analysis' ? '' : 'hidden'}`}>
              <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                <SummaryCard
                  analysis={analysis}
                  isLoading={isAnalyzing}
                  onSelectMarker={handleSelectMarker}
                  verificationFindings={verificationFindings}
                />
              </div>
            </div>

            {/* Questions Panel */}
            <div className={`h-full ${activePanel === 'questions' ? '' : 'hidden'}`}>
              <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                <QuestionBank
                  questions={questions}
                  maxQuestions={questionSettings.maxQuestions}
                  isLoading={isGeneratingQuestions}
                  onSelectMarker={handleSelectMarker}
                />
              </div>
            </div>

            {/* Rubric Panel */}
            <div className={`h-full ${activePanel === 'rubric' ? '' : 'hidden'}`}>
              <div className="h-full bg-white m-4 rounded-3xl shadow-soft overflow-hidden">
                <RubricCard rubric={rubric} isLoading={status === 'processing'} />
              </div>
            </div>
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

      {/* Question Settings Modal */}
      <QuestionSettings
        isOpen={showQuestionSettings}
        onClose={() => setShowQuestionSettings(false)}
        settings={questionSettings}
        onSettingsChange={setQuestionSettings}
      />

      {/* Marker Detail Popup */}
      <AnimatePresence>
        {markerPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setMarkerPopup(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with type badge */}
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${markerPopup.type === 'question'
                  ? 'bg-violet-100'
                  : markerPopup.type === 'issue'
                    ? 'bg-amber-100'
                    : 'bg-emerald-100'
                  }`}>
                  <span className="text-2xl">
                    {markerPopup.type === 'question' ? '❓' : markerPopup.type === 'issue' ? '⚠️' : '💡'}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${markerPopup.type === 'question'
                      ? 'bg-violet-100 text-violet-700'
                      : markerPopup.type === 'issue'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                      }`}>
                      {markerPopup.type === 'question' ? 'Question' : markerPopup.type === 'issue' ? 'Issue' : 'Insight'}
                    </span>
                    <span className="text-xs text-surface-400 font-mono">
                      at {formatTime(markerPopup.timestamp)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setMarkerPopup(null)}
                  className="p-1 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Full text */}
              <div className="mb-4">
                <p className="text-lg text-surface-900 leading-relaxed">
                  {markerPopup.fullText}
                </p>
              </div>

              {/* Description/rationale if available */}
              {markerPopup.description && (
                <div className="p-4 bg-surface-50 rounded-xl mb-4">
                  <p className="text-sm text-surface-600 leading-relaxed">
                    {markerPopup.description}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    // Seek to this position
                    if (mode === 'upload' && videoRef.current) {
                      videoRef.current.currentTime = markerPopup.timestamp / 1000;
                      setCurrentTime(markerPopup.timestamp);
                    } else if (mode === 'live' && recordedVideoRef.current) {
                      recordedVideoRef.current.currentTime = markerPopup.timestamp / 1000;
                      setRecordedVideoTime(markerPopup.timestamp);
                    }
                    setMarkerPopup(null);
                  }}
                  className="px-4 py-2 bg-surface-100 text-surface-700 rounded-xl hover:bg-surface-200 transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Go to moment
                </button>
                <button
                  onClick={() => setMarkerPopup(null)}
                  className="px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-lg transition-shadow"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save & Next Student Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => !isSavingRecording && setShowSaveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center">
                  <Save className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-surface-900">Save Recording</h3>
                  <p className="text-sm text-surface-500">Enter student name and continue to next</p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Student Name *
                </label>
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-3 border border-surface-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && studentNameInput.trim()) {
                      saveRecordingAndReset(studentNameInput);
                    }
                  }}
                />
                <p className="text-xs text-surface-500 mt-2">
                  Recording duration: {Math.floor(currentTime / 60000)}:{String(Math.floor((currentTime % 60000) / 1000)).padStart(2, '0')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setStudentNameInput('');
                  }}
                  disabled={isSavingRecording}
                  className="flex-1 px-4 py-3 text-surface-600 hover:bg-surface-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveRecordingAndReset(studentNameInput)}
                  disabled={!studentNameInput.trim() || isSavingRecording}
                  className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingRecording ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save & Next
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today's Recordings Panel */}
      <AnimatePresence>
        {showRecordingsPanel && savedRecordings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed left-24 top-24 bottom-24 w-80 bg-white rounded-2xl shadow-2xl border border-surface-200 z-40 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-surface-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-surface-900">Today&apos;s Recordings</h3>
                <p className="text-xs text-surface-500">{savedRecordings.length} student{savedRecordings.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setShowRecordingsPanel(false)}
                className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {savedRecordings.map((recording, index) => (
                <div
                  key={recording.id}
                  className="p-3 bg-surface-50 rounded-xl border border-surface-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-surface-900">{recording.studentName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      recording.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                      recording.status === 'failed' ? 'bg-red-100 text-red-700' :
                      recording.status === 'uploading' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {recording.status === 'ready' ? '✓ Complete' :
                       recording.status === 'failed' ? '✗ Failed' :
                       recording.status === 'uploading' ? 'Uploading...' :
                       'Processing...'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-surface-500">
                    <span>#{index + 1}</span>
                    <span>{Math.floor(recording.duration / 60000)}:{String(Math.floor((recording.duration % 60000) / 1000)).padStart(2, '0')}</span>
                  </div>
                  {recording.status === 'ready' && liveSessionBatchId && (
                    <NextLink
                      href={`/bulk/submission/${recording.id}`}
                      className="mt-2 block text-center text-xs text-primary-600 hover:text-primary-700 font-medium py-1 bg-primary-50 rounded-lg"
                    >
                      View Report →
                    </NextLink>
                  )}
                </div>
              ))}
            </div>

            {liveSessionBatchId && (
              <div className="p-4 border-t border-surface-200">
                <NextLink
                  href={`/bulk`}
                  className="block w-full text-center py-2 bg-surface-100 text-surface-700 rounded-xl hover:bg-surface-200 text-sm font-medium"
                >
                  Open Batch Dashboard
                </NextLink>
              </div>
            )}
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



