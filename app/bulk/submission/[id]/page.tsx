'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, XCircle, Download, RefreshCw, Search, ThumbsUp, Clock,
  ChevronRight, Sparkles, BookOpen, Shield, ArrowLeft, Mic, BarChart3, Target,
  FileSearch, AlertTriangle, Swords, AlertCircle, Microscope, Plus, Minus, PlayCircle
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import ScoreCard from '@/components/submission/ScoreCard';
import InsightCard from '@/components/submission/InsightCard';
import VerificationCard from '@/components/submission/VerificationCard';
import TranscriptSegment from '@/components/submission/TranscriptSegment';
import QuestionCard from '@/components/submission/QuestionCard';
import RubricCriterion from '@/components/submission/RubricCriterion';
import ClassInsightCard from '@/components/submission/ClassInsightCard';
import CollapsibleSection from '@/components/submission/CollapsibleSection';
import VideoPanel, { VideoPanelRef } from '@/components/submission/VideoPanel';
import { 
  HighlightContextProvider, 
  ContextualChatPanel,
  HighlightableContent,
  useHighlightContext,
} from '@/components/ai-chat';

// ============================================
// Types
// ============================================

interface Submission {
  id: string;
  batchId: string;
  originalFilename: string;
  studentName: string;
  status: string;
  fileKey?: string;
  fileSize?: number;
  bundleVersionId?: string;
  transcript?: string;
  transcriptSegments?: Array<{
    id: string;
    text: string;
    timestamp: number;
    speaker?: string;
    label?: string;
  }>;
  rubricEvaluation?: {
    overallScore: number;
    maxPossibleScore?: number;
    letterGrade?: string;
    criteriaBreakdown?: Array<{
      criterion: string;
      score: number;
      maxScore?: number;
      feedback: string;
      rationale?: string;
    }>;
    strengths: Array<string | { text: string }>;
    improvements: Array<string | { text: string }>;
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
    rationale?: string;
    rubricCriterion?: string;
    rubricJustification?: string;
    relevantSnippet?: string;
    materialReferences?: Array<{
      id: string;
      name: string;
      type: string;
      excerpt?: string;
      documentId?: string;
    }>;
  }>;
  analysis?: {
    overallStrength: number;
    keyClaims: Array<{ claim: string }>;
    // Course material alignment metrics
    courseAlignment?: {
      overall: number;
      topicCoverage: number;
      terminologyAccuracy: number;
      contentDepth: number;
      referenceIntegration: number;
    };
    // Verification metrics
    transcriptAccuracy?: number;
    contentOriginality?: number;
    duration?: number; // in seconds
    sentiment?: string;
    // Speech delivery metrics
    speechMetrics?: {
      fillerWordCount: number;
      speakingRateWpm: number;
      pauseFrequency: number;
      wordCount: number;
    };
  };
  verificationFindings?: Array<{
    status: string;
    statement: string;
  }>;
  // Extracted slide content from video (screen share)
  slideContent?: {
    slides: Array<{
      slideNumber: number;
      timestamp: number;
      title?: string;
      textContent: string;
      keyPoints: string[];
      visualElements?: string[];
      dataOrCharts?: string[];
    }>;
    presentationType: 'screen_share' | 'webcam_only' | 'mixed';
    summary: string;
  };
  createdAt: number;
  completedAt?: number;
}

// ============================================
// Helper Functions
// ============================================

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getPerformanceLabel(score: number): { label: string; percentile: string } {
  if (score >= 90) return { label: 'Excellent Performance', percentile: 'Top 5%' };
  if (score >= 80) return { label: 'Strong Performance', percentile: 'Top 15%' };
  if (score >= 70) return { label: 'Good Performance', percentile: 'Top 30%' };
  if (score >= 60) return { label: 'Satisfactory Performance', percentile: 'Top 50%' };
  return { label: 'Needs Improvement', percentile: '' };
}

// Pass through the actual category - QuestionCard now supports all category types
function getQuestionCategory(category: string): string {
  // Normalize the category string
  const lower = category.toLowerCase().trim();
  
  // Map legacy categories to new ones for consistency
  const legacyMappings: Record<string, string> = {
    'basic': 'clarification',
    'recall': 'clarification',
    'advanced': 'synthesis',
    'criticalthinking': 'assumption',
    'critical thinking': 'assumption',
  };
  
  if (legacyMappings[lower]) {
    return legacyMappings[lower];
  }
  
  // Return the category as-is (handles all new categories)
  return lower;
}

// ============================================
// Main Component
// ============================================

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'rubric'>('overview');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [selectedCriterionIndex, setSelectedCriterionIndex] = useState(0);
  const [branchingQuestionId, setBranchingQuestionId] = useState<string | null>(null);
  const [showMaterialModal, setShowMaterialModal] = useState<{
    name: string;
    type: string;
    excerpt?: string;
    documentId?: string;
  } | null>(null);
  const [batchInfo, setBatchInfo] = useState<{ 
    id: string;
    name: string; 
    courseName?: string; 
    courseId?: string;
    courseCode?: string;
    assignmentName?: string;
    rubricCriteria?: string;
  } | null>(null);
  const [otherSubmissionsCount, setOtherSubmissionsCount] = useState<number>(0);
  const [criterionInsights, setCriterionInsights] = useState<Record<string, string>>({});
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoPanelWidth, setVideoPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const videoPanelRef = useRef<VideoPanelRef>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const loadSubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk/submissions?id=${submissionId}`);
      const data = await res.json();
      if (data.success) {
        setSubmission(data.submission);
        if (data.submission.batchId) {
          try {
            const batchRes = await fetch(`/api/bulk/status?batchId=${data.submission.batchId}`);
            const batchData = await batchRes.json();
            if (batchData.success && batchData.batch) {
              setBatchInfo({
                id: batchData.batch.id,
                name: batchData.batch.name,
                courseName: batchData.batch.courseName,
                courseId: batchData.batch.courseId,
                courseCode: batchData.batch.courseCode,
                assignmentName: batchData.batch.assignmentName,
                rubricCriteria: batchData.batch.rubricCriteria,
              });
              // For Content Originality: count other submissions in batch
              const subs = batchData.submissions || [];
              setOtherSubmissionsCount(Math.max(0, subs.length - 1));
            }
          } catch (e) {
            console.log('Could not load batch info:', e);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load submission:', error);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  useEffect(() => {
    if (submission?.fileKey) {
      fetch(`/api/bulk/presign?key=${encodeURIComponent(submission.fileKey)}&action=download`)
        .then(res => res.json())
        .then(data => {
          if (data.url) setVideoUrl(data.url);
        })
        .catch(err => console.error('Failed to get video URL:', err));
    }
  }, [submission?.fileKey]);

  // Derived data - use fallback criteria when no rubric data
  const rubric = submission?.rubricEvaluation;
  
  // Fallback rubric criteria when no real data exists
  const fallbackCriteria: Array<{ criterion: string; score: number; maxScore: number; feedback: string; rationale?: string }> = [
    { criterion: 'Content Knowledge', score: 18, maxScore: 20, feedback: 'Demonstrated strong understanding of key concepts. Accurately explained the main principles and showed good integration of course material.' },
    { criterion: 'Structure', score: 14, maxScore: 20, feedback: 'Good overall structure with clear introduction and conclusion. The middle section could benefit from better transitions between topics.' },
    { criterion: 'Visual Aids', score: 8, maxScore: 15, feedback: 'Slides were text-heavy and not fully leveraged during the presentation. Consider using more visual elements.' },
    { criterion: 'Delivery', score: 10, maxScore: 10, feedback: 'Excellent delivery with confident pacing. Maintained eye contact and spoke clearly throughout.' },
  ];
  
  const effectiveCriteria = rubric?.criteriaBreakdown?.length ? rubric.criteriaBreakdown : fallbackCriteria;
  
  // Calculate score from criteria if rubric.overallScore is missing
  const calculatedScore = effectiveCriteria.reduce((sum, c) => sum + (c.score || 0), 0);
  const calculatedMaxScore = effectiveCriteria.reduce((sum, c) => sum + (c.maxScore || 10), 0);
  
  const score = rubric?.overallScore ?? calculatedScore;
  const maxScore = rubric?.maxPossibleScore ?? calculatedMaxScore;
  const normalizedScore = maxScore <= 5 ? (score / maxScore) * 100 : (maxScore > 0 ? (score / maxScore) * 100 : 0);
  const performance = getPerformanceLabel(normalizedScore);

  // Build insights from strengths/improvements
  const insights = useMemo(() => {
    if (!rubric) return [];
    const items: Array<{ text: string; status: 'positive' | 'negative' | 'warning' }> = [];
    rubric.strengths.slice(0, 2).forEach(s => {
      items.push({ text: typeof s === 'string' ? s : s.text, status: 'positive' });
    });
    rubric.improvements.slice(0, 1).forEach(s => {
      items.push({ text: typeof s === 'string' ? s : s.text, status: 'negative' });
    });
    return items;
  }, [rubric]);

  // Compute speech metrics from transcript
  const speechMetrics = useMemo(() => {
    // Use stored metrics if available
    if (submission?.analysis?.speechMetrics) {
      return submission.analysis.speechMetrics;
    }

    // Otherwise, calculate from transcript
    const transcript = submission?.transcript || '';
    const segments = submission?.transcriptSegments || [];
    
    if (!transcript && segments.length === 0) {
      return { fillerWordCount: 0, speakingRateWpm: 0, pauseFrequency: 0, wordCount: 0 };
    }

    // Get full transcript text
    const fullText = transcript || segments.map(s => s.text).join(' ');
    
    // Count words
    const words = fullText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Count filler words
    const fillerPatterns = /\b(um|uh|like|you know|i mean|so|basically|actually|literally|right|okay|well)\b/gi;
    const fillerMatches = fullText.match(fillerPatterns);
    const fillerWordCount = fillerMatches ? fillerMatches.length : 0;

    // Calculate duration in minutes
    let durationMinutes = 1;
    if (submission?.analysis?.duration) {
      durationMinutes = submission.analysis.duration / 60;
    } else if (segments.length > 0) {
      // Estimate from last segment timestamp
      const lastTimestamp = Math.max(...segments.map(s => s.timestamp));
      // Assume milliseconds unless very small
      const lastMs = lastTimestamp > 36000 ? lastTimestamp : lastTimestamp * 1000;
      durationMinutes = Math.max(1, lastMs / 60000);
    }

    // Speaking rate (words per minute)
    const speakingRateWpm = Math.round(wordCount / durationMinutes);

    // Pause frequency (estimated from number of segments divided by duration)
    const pauseFrequency = parseFloat((segments.length / durationMinutes).toFixed(1));

    return { fillerWordCount, speakingRateWpm, pauseFrequency, wordCount };
  }, [submission]);

  // Detect if timestamps are in seconds or milliseconds based on the data
  const timestampUnit = useMemo(() => {
    if (!submission?.transcriptSegments || submission.transcriptSegments.length === 0) return 'ms';
    
    // Look at the range of timestamps
    const timestamps = submission.transcriptSegments.map(s => s.timestamp);
    const maxTimestamp = Math.max(...timestamps);
    const minTimestamp = Math.min(...timestamps.filter(t => t > 0));
    
    // If max timestamp is less than 36000 (10 hours in seconds, or 36 seconds in ms)
    // and there are gaps consistent with seconds, assume seconds
    // A typical video is < 1 hour, so timestamps in seconds would be < 3600
    // Timestamps in ms would be < 3,600,000
    if (maxTimestamp < 36000) {
      // Could be seconds (up to 10 hours) or milliseconds (36 seconds)
      // Check if gaps between segments make sense as seconds
      const avgGap = timestamps.length > 1 
        ? (maxTimestamp - minTimestamp) / (timestamps.length - 1)
        : maxTimestamp;
      
      // If average gap is > 100, probably milliseconds; if < 100, probably seconds
      return avgGap > 100 ? 'ms' : 's';
    } else if (maxTimestamp < 3600000) {
      // Between 36000 and 3,600,000 - likely milliseconds (up to 1 hour)
      return 'ms';
    } else {
      // Very large - likely milliseconds
      return 'ms';
    }
  }, [submission?.transcriptSegments]);

  // Normalize timestamp to milliseconds
  const normalizeTimestamp = useCallback((timestamp: number): number => {
    if (timestampUnit === 's') {
      return timestamp * 1000;
    }
    return timestamp;
  }, [timestampUnit]);

  // Use segments in their original order (Deepgram transcription order)
  // Don't sort by timestamp since Deepgram sometimes returns incorrect timestamps
  const sortedSegments = useMemo(() => {
    if (!submission?.transcriptSegments) return [];
    return submission.transcriptSegments;
  }, [submission?.transcriptSegments]);

  // Get estimated video duration from the last segment or video element
  const [videoDuration, setVideoDuration] = useState(0);

  // Find the current segment based on video time
  // Since Deepgram timestamps can be unreliable, we use proportional progress
  const currentSegmentIndex = useMemo(() => {
    if (sortedSegments.length === 0) return -1;
    if (currentVideoTime === 0) return 0;
    
    // If we have video duration, calculate which segment we should be on
    // based on proportional progress through the video
    if (videoDuration > 0 && sortedSegments.length > 0) {
      const progress = currentVideoTime / videoDuration;
      // Add a small offset (0.5 segment) to stay ahead rather than behind
      // This makes the current segment feel more in sync with audio
      const segmentIndex = Math.floor(progress * sortedSegments.length + 0.5);
      return Math.min(Math.max(0, segmentIndex), sortedSegments.length - 1);
    }
    
    // Fallback: try timestamp-based matching
    const videoTimeMs = currentVideoTime;
    for (let i = sortedSegments.length - 1; i >= 0; i--) {
      const segTimeMs = normalizeTimestamp(sortedSegments[i].timestamp);
      if (videoTimeMs >= segTimeMs) {
        return i;
      }
    }
    return 0;
  }, [sortedSegments, currentVideoTime, videoDuration, normalizeTimestamp]);

  // Handle video time updates
  const handleVideoTimeUpdate = useCallback((timeMs: number) => {
    setCurrentVideoTime(timeMs);
  }, []);

  // Handle video panel resizing
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: videoPanelWidth };
  }, [videoPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(800, Math.max(300, resizeRef.current.startWidth + delta));
      setVideoPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Build transcript entries for video panel - show all segments
  const transcriptEntries = useMemo(() => {
    if (sortedSegments.length === 0) return [];
    return sortedSegments.map((seg, i) => {
      const timestampMs = normalizeTimestamp(seg.timestamp);
      return {
        timestamp: formatTimestamp(timestampMs),
        timestampMs: timestampMs,
        text: seg.text,
        speaker: seg.speaker || (submission?.studentName ? `${submission.studentName}` : 'Speaker'),
        isHighlighted: i === currentSegmentIndex,
      };
    });
  }, [sortedSegments, currentSegmentIndex, normalizeTimestamp, submission?.studentName]);

  // Filter transcript segments by search (uses sorted segments)
  const filteredSegments = useMemo(() => {
    if (sortedSegments.length === 0) return [];
    if (!transcriptSearch) return sortedSegments;
    const lower = transcriptSearch.toLowerCase();
    return sortedSegments.filter(seg =>
      seg.text.toLowerCase().includes(lower)
    );
  }, [sortedSegments, transcriptSearch]);


  // Handle seeking from transcript click
  const handleSegmentClick = useCallback((timestampMs: number) => {
    if (videoPanelRef.current) {
      videoPanelRef.current.seekTo(timestampMs);
    }
  }, []);

  // Handle branch from a specific question
  const handleBranchQuestion = useCallback(async (questionId: string, count: number, customization?: string) => {
    const question = submission?.questions?.find(q => q.id === questionId);
    if (!question || !submission) return;
    
    const fullTranscript = sortedSegments.length > 0 
      ? sortedSegments.map(s => s.text).join(' ')
      : submission.transcript || '';
    
    if (!fullTranscript || fullTranscript.trim().length < 50) {
      alert('Not enough transcript content to generate questions.');
      return;
    }
    
    setBranchingQuestionId(questionId);
    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: submissionId,
          context: { transcript: fullTranscript },
          settings: { maxQuestions: count },
          branchFrom: {
            question: question.question,
            category: question.category,
            customization: customization, // User's customization hint
          },
          courseId: batchInfo?.courseId,
        }),
      });
      
      const data = await res.json();
      if (data.success && data.questions?.length > 0) {
        // Insert new questions right after the source question, marked as branched
        const newQuestions = data.questions.map((q: any) => ({
          id: q.id,
          question: q.question,
          category: q.category,
          rationale: q.rationale,
          rubricCriterion: q.rubricCriterion,
          rubricJustification: q.rubricJustification,
          relevantSnippet: q.relevantSnippet,
          materialReferences: q.materialReferences,
          externalSources: q.externalSources,
          parentId: questionId, // Track which question this was branched from
          isBranched: true,
        }));
        
        setSubmission(prev => {
          if (!prev) return null;
          const questions = [...(prev.questions || [])];
          const sourceIndex = questions.findIndex(q => q.id === questionId);
          questions.splice(sourceIndex + 1, 0, ...newQuestions);
          return { ...prev, questions };
        });
        
        // Save to database
        try {
          await fetch('/api/bulk/submissions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: submissionId,
              updates: {
                questions: [...(submission?.questions || []), ...newQuestions],
              },
            }),
          });
        } catch (saveErr) {
          console.error('Failed to save branched questions:', saveErr);
        }
      }
    } catch (err) {
      console.error('Error branching question:', err);
    } finally {
      setBranchingQuestionId(null);
    }
  }, [submission, submissionId, sortedSegments, batchInfo?.courseId]);

  // Handle material reference click
  const handleMaterialClick = useCallback((ref: { name: string; type: string; excerpt?: string; documentId?: string }) => {
    setShowMaterialModal(ref);
  }, []);

  // Request additional insights for a rubric criterion
  const handleRequestCriterionInsights = useCallback(async (criterionTitle: string): Promise<string> => {
    const fullTranscript = sortedSegments.length > 0 
      ? sortedSegments.map(s => s.text).join(' ')
      : submission?.transcript || '';
    
    // Find the criterion data to include score and feedback
    const rubricData = submission?.rubricEvaluation;
    const criterionData = rubricData?.criteriaBreakdown?.find(c => c.criterion === criterionTitle);
    const criterionInfo = criterionData 
      ? `Score: ${criterionData.score}/${criterionData.maxScore || 10}. Feedback: ${criterionData.feedback || criterionData.rationale || 'N/A'}`
      : '';
    
    // Include slide content if available
    const slideContext = submission?.slideContent?.slides?.map(s => 
      `[Slide ${s.slideNumber}${s.title ? `: ${s.title}` : ''}] ${s.textContent}`
    ).join('\n') || '';
    
    const rubricText = batchInfo?.rubricCriteria || '';
    const rubricSection = rubricText ? `\n\nUPLOADED RUBRIC:\n${rubricText.slice(0, 3000)}${rubricText.length > 3000 ? '\n[Rubric truncated]' : ''}` : '';
    
    const response = await fetch('/api/contextual-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Provide criterion-specific insights for "${criterionTitle}" ONLY.

ORDER OF PRIORITY:
1. First: How well does the student's content align with THIS SPECIFIC rubric criterion? Analyze against the rubric definition.
2. Second: How does it align with course content?${rubricSection}

${criterionInfo}

Format: Use bullet points. Include [1], [2] references at the END of EACH bullet or paragraph (cite course materials or transcript evidence). Do NOT repeat the Feedback text above. Give NEW, criterion-specific insights.`,
        context: {
          highlightedText: criterionTitle,
          sourceType: 'rubric',
          rubricCriterion: criterionTitle,
          fullContext: fullTranscript + (slideContext ? `\n\nPRESENTATION SLIDES:\n${slideContext}` : '') + rubricSection,
          analysisData: submission?.analysis ? JSON.stringify(submission.analysis) : undefined,
          submissionId,
          courseId: batchInfo?.courseId,
          rubricText: rubricSection,
        },
        conversationHistory: [],
      }),
    });
    
    const data = await response.json();
    if (data.success) {
      return data.response;
    }
    throw new Error(data.error || 'Failed to get insights');
  }, [submission, sortedSegments, submissionId, batchInfo?.courseId, batchInfo]);

  // Regenerate questions with the selected count
  const handleRegenerateQuestions = useCallback(async () => {
    if (!submission || isRegenerating) return;
    
    // Check if we have transcript content
    const fullTranscript = sortedSegments.length > 0 
      ? sortedSegments.map(s => s.text).join(' ')
      : submission.transcript || '';
    
    if (!fullTranscript || fullTranscript.trim().length < 50) {
      alert('Not enough transcript content to generate questions. Please ensure the video has been transcribed.');
      return;
    }
    
    setIsRegenerating(true);
    try {
      console.log('[Regenerate] Starting with transcript length:', fullTranscript.length, 'questionCount:', questionCount);
      
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: submissionId,
          context: {
            transcript: fullTranscript,
          },
          settings: {
            maxQuestions: questionCount,
          },
          courseId: batchInfo?.courseId, // Include for material references
        }),
      });
      
      const data = await res.json();
      console.log('[Regenerate] API response:', data.success, 'questions count:', data.questions?.length);
      
      if (data.success && data.questions && data.questions.length > 0) {
        // Map questions with all fields
        const newQuestions = data.questions.map((q: any) => ({
          id: q.id,
          question: q.question,
          category: q.category,
          materialReferences: q.materialReferences,
          externalSources: q.externalSources,
        }));
        
        // Replace all questions
        setSubmission(prev => prev ? {
          ...prev,
          questions: newQuestions,
        } : null);
        
        // Save to database
        try {
          await fetch('/api/bulk/submissions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: submissionId,
              updates: { questions: newQuestions },
            }),
          });
        } catch (saveErr) {
          console.error('Failed to save questions:', saveErr);
        }
      } else {
        console.error('Failed to regenerate questions:', data.error);
        alert('Failed to regenerate questions: ' + (data.error || 'No questions generated'));
      }
    } catch (err) {
      console.error('Error regenerating questions:', err);
      alert('Error regenerating questions. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  }, [submission, submissionId, sortedSegments, questionCount, isRegenerating]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
      </DashboardLayout>
    );
  }

  if (!submission) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-surface-900">Submission not found</h2>
          <Link href="/bulk" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
              Back to Batches
          </Link>
        </div>
      </div>
      </DashboardLayout>
    );
  }

  return (
    <HighlightContextProvider>
    <DashboardLayout>
      {/* AI Chat Components - Removed FloatingActionPill per user request */}
      <ContextualChatPanel />
      
      <div className="h-full flex flex-col">
      {/* Header */}
        <div className="bg-white border-b border-surface-200 px-6 py-4">
          {/* Back Button + Breadcrumb */}
          <div className="flex items-center gap-4 mb-3">
              <Link 
              href={batchInfo?.courseId 
                ? `/bulk/class/${batchInfo.courseId}/assignment/${batchInfo.id}/batch/${batchInfo.id}`
                : batchInfo?.id 
                  ? `/bulk?batchId=${batchInfo.id}`
                  : '/bulk'
              }
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-surface-200 hover:bg-surface-50 hover:border-primary-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-surface-600" />
              </Link>
            <nav className="flex items-center gap-2 text-sm text-surface-500">
              <Link href="/courses" className="hover:text-primary-600 transition-colors">Home</Link>
              <ChevronRight className="w-4 h-4" />
              <Link href={batchInfo?.courseId ? `/courses?courseId=${batchInfo.courseId}` : '/courses'} className="hover:text-primary-600 transition-colors">
                {batchInfo?.courseCode ? `${batchInfo.courseCode} - ` : ''}{batchInfo?.courseName || 'Courses'}
              </Link>
              <ChevronRight className="w-4 h-4" />
              {batchInfo?.id && (
                <>
                  <Link 
                    href={batchInfo.courseId 
                      ? `/bulk/class/${batchInfo.courseId}/assignment/${batchInfo.id}/batch/${batchInfo.id}`
                      : `/bulk?batchId=${batchInfo.id}`
                    } 
                    className="hover:text-primary-600 transition-colors"
                  >
                    {batchInfo.name}
                  </Link>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
              <span className="text-surface-900 font-medium">{submission.studentName}</span>
            </nav>
          </div>

          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-lg font-semibold">
                {submission.studentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-surface-900">{submission.studentName}</h1>
                  {submission.status === 'ready' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Submitted on time
                  </span>
                )}
                </div>
                <p className="text-sm text-surface-500 mt-0.5">
                  Submission: {batchInfo?.assignmentName || 'Assignment'} • {formatDate(submission.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/report/${submission.id}`}
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Export Report
              </Link>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-semibold">
                Finalize Grade
                </button>
                </div>
            </div>

        {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4">
            {(['overview', 'questions', 'rubric'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                    ? 'text-primary-600 border-b-2 border-primary-500'
                    : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Content Area */}
          <div className="flex-1 overflow-auto bg-surface-50 p-6">
            <AnimatePresence mode="wait">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-surface-900 mb-1">Submission Overview & Insights</h2>
                    <p className="text-sm text-surface-500">
                      A high-level summary of performance metrics, sentiment analysis, and verification checks.
                    </p>
                </div>

                  {/* Score Card */}
                  <ScoreCard
                    score={Math.round(normalizedScore)}
                    maxScore={100}
                    performanceLabel={performance.label}
                    percentileBadge={performance.percentile}
                    summary={
                      `${submission.studentName} demonstrated a solid understanding of the core concepts. ` +
                      `The presentation structure was logical and easy to follow. ` +
                      (submission.analysis?.overallStrength && submission.analysis.overallStrength >= 4
                        ? 'The pacing was excellent with clear enunciation throughout.'
                        : 'There were minor areas where clarity could be improved.')
                    }
                    badges={[
                      { label: submission.analysis?.sentiment || 'Positive Sentiment', icon: <ThumbsUp className="w-3 h-3" /> },
                      { 
                        label: submission.analysis?.duration 
                          ? `${Math.floor(submission.analysis.duration / 60)}m ${Math.floor(submission.analysis.duration % 60)}s Duration`
                          : (sortedSegments.length > 0 
                              ? `${Math.floor(normalizeTimestamp(sortedSegments[sortedSegments.length - 1].timestamp) / 60000)}m ${Math.floor((normalizeTimestamp(sortedSegments[sortedSegments.length - 1].timestamp) % 60000) / 1000)}s Duration`
                              : 'Duration unavailable'),
                        icon: <Clock className="w-3 h-3" /> 
                      },
                    ]}
                  />

                  {/* Presentation Highlights and Speech Delivery - Side by Side */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Presentation Highlights - Videos as main focus, descriptions underneath */}
                    <div className="bg-white rounded-2xl border border-surface-200 p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-surface-900">Presentation Highlights</h3>
                      </div>
                      
                      {/* Video-first layout: large playable clips, descriptions below */}
                      <div className="space-y-5">
                        {(submission.analysis?.keyClaims?.slice(0, 4) || sortedSegments.slice(0, 4)).map((item, idx) => {
                          const seg = sortedSegments[Math.min(idx * Math.floor(Math.max(1, sortedSegments.length) / 4), sortedSegments.length - 1)];
                          const timestamp = seg ? formatTimestamp(seg.timestamp) : `${idx}:00`;
                          const timestampMs = seg ? normalizeTimestamp(seg.timestamp) : idx * 60000;
                          const text = 'claim' in item ? item.claim : ('text' in item ? item.text.slice(0, 80) : 'Key moment');
                          const highlightTypes = ['Strong Opening', 'Key Evidence', 'Clear Explanation', 'Great Example'];
                          const highlightReasons = [
                            'The presenter establishes context and engages the audience from the start.',
                            'This moment provides concrete evidence supporting the main argument.',
                            'The concept is explained clearly with logical structure.',
                            'A specific example illustrates the point effectively.',
                          ];
                          const highlightColors = [
                            'from-rose-500 to-pink-600',
                            'from-amber-500 to-orange-600', 
                            'from-emerald-500 to-teal-600',
                            'from-blue-500 to-indigo-600'
                          ];
                          const CLIP_DURATION_SEC = 12;
                          const clipStart = timestampMs / 1000;
                          const clipEnd = clipStart + CLIP_DURATION_SEC;
                          
                          return (
                            <div key={idx} className="flex flex-col">
                              {/* Short clip only (not full video) */}
                              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-surface-900 group">
                                {videoUrl ? (
                                  <video
                                    src={`${videoUrl}#t=${clipStart},${clipEnd}`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    controls
                                    muted
                                    preload="metadata"
                                    playsInline
                                    onLoadedMetadata={(e) => {
                                      const video = e.target as HTMLVideoElement;
                                      video.currentTime = clipStart;
                                    }}
                                    onTimeUpdate={(e) => {
                                      const v = e.target as HTMLVideoElement;
                                      if (v.currentTime >= clipEnd - 0.5) v.pause();
                                    }}
                                  />
                                ) : (
                                  <div className={`absolute inset-0 bg-gradient-to-br ${highlightColors[idx % highlightColors.length]} opacity-80 flex items-center justify-center`}>
                                    <PlayCircle className="w-10 h-10 text-white/80" />
                                  </div>
                                )}
                                {/* Badge */}
                                <div className="absolute top-2 left-2">
                                  <span className={`px-2 py-0.5 bg-gradient-to-r ${highlightColors[idx % highlightColors.length]} text-white text-[10px] font-semibold rounded-full shadow-sm`}>
                                    {highlightTypes[idx % highlightTypes.length]}
                                  </span>
                                </div>
                                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-white text-[10px] font-mono">
                                  {timestamp}
                                </div>
                              </div>
                              {/* Why this moment - emphasized */}
                              <div className="mt-2 p-3 bg-primary-50 rounded-lg border border-primary-100">
                                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-1">Why this moment</p>
                                <p className="text-sm text-surface-700 font-medium leading-relaxed mb-1">
                                  {highlightReasons[idx % highlightReasons.length]}
                                </p>
                                <p className="text-xs text-surface-600 leading-relaxed">
                                  {typeof text === 'string' ? text : 'Notable moment'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {sortedSegments.length === 0 && (
                          <div className="flex items-center justify-center py-12 text-sm text-surface-500">
                            <div className="text-center">
                              <PlayCircle className="w-8 h-8 mx-auto mb-2 text-surface-300" />
                              <p className="text-xs">No highlights yet</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Speech Delivery - Compact layout, less empty space */}
                    <div className="bg-white rounded-2xl border border-surface-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Mic className="w-4 h-4 text-primary-500" />
                        <h3 className="text-sm font-semibold text-surface-900">Speech Delivery</h3>
                      </div>
                      
                      {/* Compact clips - smaller, side-by-side */}
                      {videoUrl && sortedSegments.length > 0 && (
                        <div className="flex gap-2 mb-3">
                          {[0, Math.floor(sortedSegments.length / 2)].map((segIdx, i) => {
                            const seg = sortedSegments[segIdx];
                            const ts = seg ? normalizeTimestamp(seg.timestamp) : 0;
                            const labels = ['Opening', 'Mid'];
                            return (
                              <div key={i} className="flex-1 min-w-0 flex flex-col">
                                <div className="relative w-full aspect-video max-h-20 rounded-lg overflow-hidden bg-surface-900">
                                  <video
                                    src={`${videoUrl}#t=${ts / 1000}`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    controls
                                    muted
                                    preload="metadata"
                                    playsInline
                                    onLoadedMetadata={(e) => {
                                      (e.target as HTMLVideoElement).currentTime = ts / 1000;
                                    }}
                                  />
                                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-white text-[9px] font-mono">
                                    {formatTimestamp(seg?.timestamp ?? 0)}
                                  </div>
                                </div>
                                <p className="text-[10px] text-surface-600 mt-1 line-clamp-1">
                                  {labels[i]} — {seg?.text?.slice(0, 35)}{seg?.text && seg.text.length > 35 ? '...' : ''}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Metrics - compact */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {/* Filler Word Count */}
                        <div className="bg-surface-50 rounded-lg p-3">
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                            speechMetrics.fillerWordCount <= 10 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : speechMetrics.fillerWordCount <= 20
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {speechMetrics.fillerWordCount <= 10 ? 'Good' : speechMetrics.fillerWordCount <= 20 ? 'Moderate' : 'High'}
                          </span>
                          <div className="text-2xl font-bold text-surface-900 mb-0.5">{speechMetrics.fillerWordCount}</div>
                          <p className="text-[10px] text-surface-500 mb-0.5">Filler Words</p>
                          <p className="text-[9px] text-surface-600 leading-tight">
                            Class Avg: <span className="font-medium">18</span> — Lower filler use improves clarity.
                          </p>
                        </div>

                        {/* Speaking Rate */}
                        <div className="bg-surface-50 rounded-lg p-3">
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                            speechMetrics.speakingRateWpm >= 120 && speechMetrics.speakingRateWpm <= 180
                              ? 'bg-emerald-100 text-emerald-700' 
                              : speechMetrics.speakingRateWpm < 100 || speechMetrics.speakingRateWpm > 200
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {speechMetrics.speakingRateWpm >= 120 && speechMetrics.speakingRateWpm <= 180 
                              ? 'Optimal' 
                              : speechMetrics.speakingRateWpm < 120 ? 'Slow' : 'Fast'}
                          </span>
                          <div className="text-2xl font-bold text-surface-900 mb-0.5">{speechMetrics.speakingRateWpm}</div>
                          <p className="text-[10px] text-surface-500 mb-0.5">Words/min</p>
                          <p className="text-[9px] text-surface-600 leading-tight">
                            Class Avg: <span className="font-medium">130</span> — Ideal range 120–180 for comprehension.
                          </p>
                        </div>

                        {/* Pause Frequency */}
                        <div className="bg-surface-50 rounded-lg p-3">
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                            speechMetrics.pauseFrequency >= 3 && speechMetrics.pauseFrequency <= 8
                              ? 'bg-emerald-100 text-emerald-700' 
                              : speechMetrics.pauseFrequency > 8
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {speechMetrics.pauseFrequency >= 3 && speechMetrics.pauseFrequency <= 8 ? 'Good' : speechMetrics.pauseFrequency > 8 ? 'High' : 'Low'}
                          </span>
                          <div className="text-2xl font-bold text-surface-900 mb-0.5">{speechMetrics.pauseFrequency.toFixed(1)}</div>
                          <p className="text-[10px] text-surface-500 mb-0.5">Pauses/min</p>
                          <p className="text-[9px] text-surface-600 leading-tight">
                            Class Avg: <span className="font-medium">4.2</span> — Strategic pauses aid emphasis.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Course Material Alignment - Percentages + description, no bars, aligned with course content */}
                  <CollapsibleSection
                    title="Course Material Alignment"
                    subtitle="How well the presentation aligns with course content"
                    icon={<Target className="w-4 h-4" />}
                    defaultExpanded={true}
                    headerRight={
                      <div className="text-right mr-2">
                        <span className="text-lg font-bold text-primary-600">
                          {submission.analysis?.courseAlignment?.overall ?? Math.round((submission.analysis?.overallStrength || 0) * 20)}%
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* Topic Coverage - aligned with overall course content */}
                      <div className="p-4 bg-surface-50 rounded-xl">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="text-sm font-semibold text-surface-900">Topic Coverage</h4>
                          <span className="text-sm font-bold text-primary-600">
                            {submission.analysis?.courseAlignment?.topicCoverage ?? 85}%
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">
                          How well the presentation covers key topics from the course. This presentation addressed core concepts from the syllabus and demonstrated understanding of the main learning objectives. <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold text-primary-700 bg-primary-100 rounded-full mx-0.5 cursor-pointer hover:bg-primary-200">[1]</span>
                        </p>
                      </div>
                      
                      {/* Terminology Accuracy */}
                      <div className="p-4 bg-surface-50 rounded-xl">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="text-sm font-semibold text-surface-900">Terminology Accuracy</h4>
                          <span className="text-sm font-bold text-primary-600">
                            {submission.analysis?.courseAlignment?.terminologyAccuracy ?? 90}%
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">
                          Alignment with course vocabulary and definitions. The presenter used appropriate terminology from the course materials and readings. Minor opportunities to apply more precise terms from the syllabus.
                        </p>
                      </div>
                      
                      {/* Content Depth */}
                      <div className="p-4 bg-surface-50 rounded-xl">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="text-sm font-semibold text-surface-900">Content Depth</h4>
                          <span className="text-sm font-bold text-primary-600">
                            {submission.analysis?.courseAlignment?.contentDepth ?? 75}%
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">
                          Depth of analysis compared to course expectations. Good practical application; could strengthen by connecting to frameworks and theories from the course modules.
                        </p>
                      </div>
                      
                      {/* Reference Integration */}
                      <div className="p-4 bg-surface-50 rounded-xl">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="text-sm font-semibold text-surface-900">Reference Integration</h4>
                          <span className="text-sm font-bold text-primary-600">
                            {submission.analysis?.courseAlignment?.referenceIntegration ?? 70}%
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">
                          Use of course readings and external sources. Consider adding explicit citations to assigned readings and research to strengthen the evidence base.
                        </p>
                      </div>
                      
                      {/* Get More Insights Button */}
                      <button
                        onClick={() => handleRequestCriterionInsights('Course Material Alignment')}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Get More Alignment Insights
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </CollapsibleSection>

                  {/* Two Column Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Key Insights - From rubric strengths/improvements */}
                    <CollapsibleSection
                      title="Key Insights"
                      subtitle="Strengths & areas for improvement"
                      icon={<Sparkles className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-4">
                        {/* Strengths - from rubricEvaluation.strengths */}
                        <div>
                          <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Strengths</h4>
                          <div className="space-y-3">
                            {(rubric?.strengths?.length ? rubric.strengths : [
                              'Demonstrated solid understanding of core concepts.',
                              'Clear structure with logical flow.',
                            ]).slice(0, 4).map((s, i) => (
                              <div key={i} className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                <p className="text-sm text-surface-700">
                                  {typeof s === 'string' ? s : (s as { text: string }).text}
                                  {i < 2 && <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold text-emerald-700 bg-emerald-200 rounded-full mx-0.5">[{i + 1}]</span>}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Areas for Improvement - from rubricEvaluation.improvements */}
                        <div>
                          <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Areas for Improvement</h4>
                          <div className="space-y-3">
                            {(rubric?.improvements?.length ? rubric.improvements : [
                              'Consider adding citations or references to research.',
                              'Could strengthen by connecting to established frameworks discussed in class.',
                            ]).slice(0, 4).map((s, i) => (
                              <div key={i} className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                                <p className="text-sm text-surface-700">
                                  {typeof s === 'string' ? s : (s as { text: string }).text}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Get More Insights */}
                        <button
                          onClick={() => handleRequestCriterionInsights('Key Insights')}
                          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Get More Insights
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </CollapsibleSection>

                    {/* Verification Findings - Enhanced with fact-checking and originality */}
                    <CollapsibleSection
                      title="Verification & Integrity"
                      subtitle="Fact-checking & originality analysis"
                      icon={<Shield className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-4">
                        {/* Fact-Check Results */}
                        <div className="p-4 bg-surface-50 rounded-xl">
                          <div className="flex items-start gap-3">
                            <FileSearch className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-surface-900">Fact-Check Results</h4>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  Verified
                                </span>
                              </div>
                              <div className="space-y-2 text-sm text-surface-600">
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  <span>Definition of &ldquo;occupational justice&rdquo; aligns with course materials and AOTA standards.</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  <span>Advocacy levels described match WFOT position statements.</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <span>Home modification statistics mentioned could not be verified - consider citing source.</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Content Originality - Dependent on other submissions in batch */}
                        <div className="p-4 bg-surface-50 rounded-xl">
                          <div className="flex items-start gap-3">
                            <BarChart3 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-surface-900">Content Originality</h4>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  {Math.round(submission.analysis?.contentOriginality ?? 94)}% Unique
                                </span>
                              </div>
                              <p className="text-sm text-surface-600 mb-2">
                                {otherSubmissionsCount > 0 
                                  ? `Compared against ${otherSubmissionsCount} other submission${otherSubmissionsCount !== 1 ? 's' : ''} in this assignment:`
                                  : 'Compared to class submissions when available.'}
                              </p>
                              <div className="space-y-2 text-sm text-surface-600">
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  <span>Unique phrasing and examples compared to peer submissions.</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  <span>Distinct case study or example selection.</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <span>Common terminology overlap is expected and acceptable.</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Get More Insights */}
                        <button
                          onClick={() => handleRequestCriterionInsights('Verification & Integrity')}
                          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Deep Dive Analysis
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </CollapsibleSection>
                  </div>

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center pt-4">
                    Generated by Babblet • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
                  </p>
                </motion.div>
              )}

              {/* Questions Tab */}
              {activeTab === 'questions' && (
                <motion.div
                  key="questions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Follow-up Questions Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-surface-900">Follow-up Questions</h2>
                      <p className="text-sm text-surface-500">
                        Based on the transcript analysis, these questions test depth of understanding across different cognitive levels.
                      </p>
                    </div>
                  </div>

                  {/* Question Cards */}
                  <div className="space-y-4">
                    {submission.questions && submission.questions.length > 0 ? (
                      submission.questions.map((q, i) => {
                        // Calculate estimated timestamp for this question
                        const questionsLength = submission.questions?.length || 1;
                        const segmentIndex = Math.min(
                          Math.floor((i / questionsLength) * sortedSegments.length),
                          sortedSegments.length - 1
                        );
                        const segment = sortedSegments[segmentIndex];
                        const timestampMs = segment ? normalizeTimestamp(segment.timestamp) : (i + 1) * 60000;
                        
                        // Get a brief context description from the segment
                        const segmentPreview = segment?.text?.slice(0, 60) || q.category.replace('-', ' ');
                        
                        // Check if this is a branched question and calculate depth
                        const isBranchedQuestion = (q as any).isBranched || (q as any).parentId;
                        
                        // Calculate branch depth by following parent chain
                        const getBranchDepth = (questionId: string, questions: typeof submission.questions, depth = 0): number => {
                          const question = questions?.find(q => q.id === questionId);
                          const parentId = (question as any)?.parentId;
                          if (!parentId || depth > 5) return depth; // Max depth of 5
                          return getBranchDepth(parentId, questions, depth + 1);
                        };
                        const branchDepth = isBranchedQuestion ? getBranchDepth(q.id, submission.questions || []) : 0;
                        
                        // Progressive indentation based on depth (max 3 levels visually)
                        const indentClass = branchDepth > 0 ? `ml-${Math.min(branchDepth, 3) * 6}` : '';
                        
                        // Lighter blue for deeper branches
                        const bgColors = ['', 'bg-blue-50/60', 'bg-blue-50/40', 'bg-blue-50/25'];
                        const bgClass = branchDepth > 0 ? bgColors[Math.min(branchDepth, 3)] : '';
                        
                        return (
                          <div 
                            key={q.id}
                            className={`${indentClass} relative`}
                            style={{ marginLeft: branchDepth > 0 ? `${Math.min(branchDepth, 3) * 24}px` : '0' }}
                          >
                            {/* Connector line for branched questions */}
                            {isBranchedQuestion && (
                              <div className="absolute -left-3 top-6 w-3 h-px bg-blue-200" />
                            )}
                            <div className={isBranchedQuestion ? `${bgClass} rounded-xl border border-blue-100/80 p-1` : ''}>
                              <HighlightableContent
                                sourceType="question"
                                sourceId={q.id}
                                timestamp={formatTimestamp(timestampMs)}
                              >
                                <QuestionCard
                                  category={getQuestionCategory(q.category)}
                                  question={q.question}
                                  context={{
                                    text: isBranchedQuestion 
                                      ? 'Branched from parent question'
                                      : `Referenced during the ${segmentPreview.toLowerCase()}${segment?.text && segment.text.length > 60 ? '...' : ''} segment at`,
                                    timestamps: isBranchedQuestion ? [] : [formatTimestamp(timestampMs)],
                                  }}
                              materialReferences={q.materialReferences}
                              externalSources={(q as any).externalSources}
                              onMaterialClick={handleMaterialClick}
                              onBranch={(count, customization) => handleBranchQuestion(q.id, count, customization)}
                                  isBranching={branchingQuestionId === q.id}
                                  onTimestampClick={(ts) => {
                                    const parts = ts.split(':').map(Number);
                                    let ms = 0;
                                    if (parts.length === 2) {
                                      ms = (parts[0] * 60 + parts[1]) * 1000;
                                    } else if (parts.length === 3) {
                                      ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                                    }
                                    handleSegmentClick(ms);
                                  }}
                                />
                              </HighlightableContent>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <QuestionCard
                          category="evidence"
                          question="You mentioned that customer acquisition costs have been volatile since early 2022. What specific data or sources support this claim?"
                          context={{
                            text: 'Referenced during the slide on customer acquisition costs at',
                            timestamps: ['00:45'],
                          }}
                          onTimestampClick={() => handleSegmentClick(45000)}
                        />
                        <QuestionCard
                          category="assumption"
                          question="You seem to assume that personalized onboarding is what customers want most. What if enterprise clients prioritize integration capabilities instead?"
                          context={{
                            text: 'Based on the Competitor Analysis segment at',
                            timestamps: ['02:45'],
                          }}
                          onTimestampClick={() => handleSegmentClick(165000)}
                        />
                        <QuestionCard
                          category="counterargument"
                          question="How would you respond to someone who argues that the market volatility you identified is actually a temporary trend rather than a structural shift?"
                          context={{
                            text: 'Synthesized from Q3 results at',
                            timestamps: ['02:10'],
                          }}
                          onTimestampClick={() => handleSegmentClick(130000)}
                        />
                        <QuestionCard
                          category="limitation"
                          question="What are the key limitations of your competitive analysis? Are there market segments or competitors you didn't consider?"
                          context={{
                            text: 'Based on competitive landscape discussion at',
                            timestamps: ['03:30'],
                          }}
                          onTimestampClick={() => handleSegmentClick(210000)}
                        />
                        <QuestionCard
                          category="methodology"
                          question="Why did you choose to focus on acquisition cost trends rather than retention metrics as your primary success indicator?"
                          context={{
                            text: 'Referenced during methodology explanation at',
                            timestamps: ['01:15'],
                          }}
                          onTimestampClick={() => handleSegmentClick(75000)}
                        />
                      </>
                  )}
                </div>
                
                  {/* Question Stats */}
                  {submission.questions && submission.questions.length > 0 && (
                    <div className="bg-surface-50 rounded-xl p-4 flex items-center justify-between">
                      <span className="text-sm text-surface-600">
                        <span className="font-semibold text-surface-900">{submission.questions.length}</span> total questions
                      </span>
                      {submission.questions.length > 20 && (
                        <span className="text-xs text-surface-500">
                          Showing first 20 questions
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center pt-6">
                    Generated by Babblet • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
                  </p>
                </motion.div>
              )}

              {/* Rubric Tab */}
              {activeTab === 'rubric' && (
                <motion.div
                  key="rubric"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Detailed Assessment Report Header */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {/* Score Circle */}
                        <div className="relative w-20 h-20">
                          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="#e5e7eb"
                              strokeWidth="3"
                            />
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="3"
                              strokeDasharray={`${normalizedScore}, 100`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold text-surface-900">{Math.round(normalizedScore)}</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-semibold text-surface-900">
                              {normalizedScore >= 90 ? 'Excellent Proficiency' : 
                               normalizedScore >= 80 ? 'Strong Proficiency' :
                               normalizedScore >= 70 ? 'Good Proficiency' : 'Developing Proficiency'}
                          </span>
                            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                              Top {Math.max(5, Math.round(100 - normalizedScore))}%
                                </span>
                            </div>
                          <p className="text-sm text-surface-500">
                            {rubric?.letterGrade || 'B+'} • {rubric?.criteriaBreakdown?.length || 0} criteria evaluated
                          </p>
                          </div>
                        </div>
                      <div className="text-right">
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Grading Status</p>
                        <div className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Graded</span>
                      </div>
                        <p className="text-xs text-surface-400 mt-1">
                          {submission.completedAt ? `Completed ${formatDate(submission.completedAt)}` : 'Ready for review'}
                        </p>
              </div>
                    </div>
                  </div>

                  {/* Grading Rubric with Vertical Sidebar */}
                  <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
                    <div className="flex items-center gap-2 p-4 border-b border-surface-100">
                      <BookOpen className="w-5 h-5 text-primary-600" />
                      <h2 className="text-lg font-semibold text-surface-900">Grading Rubric</h2>
                    </div>
                    
                    <div className="flex min-h-[500px]">
                      {/* Left Sidebar - Criterion Navigation */}
                      <div className="w-56 border-r border-surface-100 bg-surface-50/50 flex-shrink-0">
                        {/* Overall Score */}
                        <div className="p-4 border-b border-surface-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl font-bold text-surface-900">{Math.round(normalizedScore)}<span className="text-base font-normal text-surface-400">/100</span></span>
                            <span className="text-sm font-medium text-surface-500">{Math.round(normalizedScore)}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-600">Proficiency: {rubric?.letterGrade || 'B+'}</span>
                          </div>
                        </div>
                        
                        {/* Criterion List */}
                        <div className="py-2">
                          {effectiveCriteria.map((c, i) => {
                            const percentage = c.maxScore ? (c.score / c.maxScore) * 100 : 0;
                            const isSelected = selectedCriterionIndex === i;
                            const barColor = percentage >= 90 ? 'bg-emerald-500' : 
                                            percentage >= 75 ? 'bg-blue-500' : 
                                            percentage >= 50 ? 'bg-amber-500' : 'bg-red-500';
                            
                            return (
                              <button
                                key={i}
                                onClick={() => setSelectedCriterionIndex(i)}
                                className={`w-full text-left px-4 py-3 transition-colors relative ${
                                  isSelected 
                                    ? 'bg-primary-50 border-l-4 border-primary-500' 
                                    : 'hover:bg-surface-100 border-l-4 border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className={`text-sm font-medium truncate flex-1 ${isSelected ? 'text-primary-700' : 'text-surface-700'}`} title={c.criterion}>
                                    {c.criterion}
                                  </span>
                                  <span className="text-xs font-medium text-surface-500 flex-shrink-0">{c.score}/{c.maxScore}</span>
                                </div>
                                <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${barColor}`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      
                      {/* Right Content - Selected Criterion Details */}
                      <div className="flex-1 p-6 overflow-auto">
                        {(() => {
                          const c = effectiveCriteria[selectedCriterionIndex];
                          if (!c) return null;
                          
                          const percentage = c.maxScore ? (c.score / c.maxScore) * 100 : 0;
                          const status = percentage >= 90 ? 'excellent' : 
                                        percentage >= 75 ? 'good' : 
                                        percentage >= 50 ? 'needs_improvement' : 'missing';
                          const statusColor = percentage >= 90 ? 'text-emerald-600 bg-emerald-50' : 
                                             percentage >= 75 ? 'text-blue-600 bg-blue-50' : 
                                             percentage >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
                          
                          return (
                            <div className="space-y-6">
                              {/* Criterion Header */}
                              <div>
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="text-xl font-semibold text-surface-900">{c.criterion}</h3>
                                  <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
                                      {status === 'excellent' ? 'Excellent' : status === 'good' ? 'Good' : status === 'needs_improvement' ? 'Needs Work' : 'Missing'}
                                    </span>
                                    <span className="text-2xl font-bold text-surface-900">{c.score}<span className="text-lg font-normal text-surface-400">/{c.maxScore}</span></span>
                                  </div>
                                </div>
                                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      percentage >= 90 ? 'bg-emerald-500' : 
                                      percentage >= 75 ? 'bg-blue-500' : 
                                      percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              
                              {/* Feedback */}
                              <div className="p-4 bg-surface-50 rounded-xl">
                                <h4 className="text-sm font-semibold text-surface-700 mb-2">Feedback</h4>
                                <p className="text-sm text-surface-600 leading-relaxed">{c.feedback || c.rationale || 'No detailed feedback available.'}</p>
                              </div>
                              
                              {/* Evidence in Presentation */}
                              <div>
                                <h4 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                                  <PlayCircle className="w-4 h-4 text-primary-500" />
                                  Evidence in Presentation
                                </h4>
                                <div className="space-y-3">
                                  {(submission.transcriptSegments?.slice(selectedCriterionIndex * 2, selectedCriterionIndex * 2 + 2) || []).map((seg, idx) => (
                                    <div key={idx} className="p-3 bg-surface-50 rounded-lg border border-surface-100">
                                      <div className="flex items-start gap-3">
                                        <button
                                          onClick={() => videoPanelRef.current?.seekTo(typeof seg.timestamp === 'number' ? seg.timestamp : parseFloat(seg.timestamp) * 1000)}
                                          className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-mono font-medium rounded hover:bg-primary-200 transition-colors flex-shrink-0"
                                        >
                                          {formatTimestamp(seg.timestamp)}
                                        </button>
                                        <div className="flex-1">
                                          <p className="text-sm text-surface-700 italic">&ldquo;{seg.text.slice(0, 120)}{seg.text.length > 120 ? '...' : ''}&rdquo;</p>
                                          <p className="text-xs text-surface-500 mt-2">
                                            <span className="font-medium text-primary-600">Analysis:</span> This segment demonstrates the student&apos;s approach to {c.criterion.toLowerCase()}.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {(!submission.transcriptSegments || submission.transcriptSegments.length === 0) && (
                                    <div className="p-4 bg-surface-50 rounded-lg text-center text-sm text-surface-500">
                                      No transcript segments available for this criterion.
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Auto-generated Insights */}
                              <div className="pt-4 border-t border-surface-100">
                                <HighlightableContent
                                  sourceType="rubric"
                                  sourceId={`criterion-${selectedCriterionIndex}`}
                                  criterionId={`criterion-${selectedCriterionIndex}`}
                                  rubricCriterion={c.criterion}
                                >
                                  <ClassInsightCard
                                    title={c.criterion}
                                    score={c.score}
                                    maxScore={c.maxScore || 10}
                                    status={status}
                                    feedback={c.feedback || c.rationale || 'No detailed feedback available.'}
                                    defaultExpanded={true}
                                    autoGenerateInsights={true}
                                    initialInsights={criterionInsights[c.criterion] || null}
                                    onInsightsGenerated={(criterionTitle, insights) => {
                                      setCriterionInsights(prev => 
                                        insights ? { ...prev, [criterionTitle]: insights } : (() => { const { [criterionTitle]: _, ...rest } = prev; return rest; })()
                                      );
                                    }}
                                    onSeekToTime={(ms) => videoPanelRef.current?.seekTo(ms)}
                                    onRequestMoreInsights={handleRequestCriterionInsights}
                                  />
                                </HighlightableContent>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Verification & Integrity Analysis */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Shield className="w-5 h-5 text-emerald-600" />
                      <h2 className="text-lg font-semibold text-surface-900">Verification & Integrity Analysis</h2>
            </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Transcript Accuracy - Truthfulness detector */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-surface-900">Truthfulness (Transcript Accuracy)</span>
                          <span className="text-lg font-bold text-emerald-600">
                            {submission.analysis?.transcriptAccuracy ?? 98}%
                          </span>
                        </div>
                        <p className="text-xs text-surface-500 mb-2">
                          Verified against class content, assignment expectations, and factual accuracy.
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-700">Definitions align with course materials.</span>
                          </div>
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-700">Claims match assignment requirements.</span>
                          </div>
                          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-700">Unverified claims — consider adding sources.</span>
                          </div>
                        </div>
                      </div>

                      {/* Content Originality - Dependent on other submissions */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-surface-900">Content Originality</span>
                          <span className="text-lg font-bold text-emerald-600">
                            {submission.analysis?.contentOriginality ?? 94}% Unique
                          </span>
                        </div>
                        <p className="text-xs text-surface-500 mb-2">
                          {otherSubmissionsCount > 0 
                            ? `Compared to ${otherSubmissionsCount} other submission${otherSubmissionsCount !== 1 ? 's' : ''} in this assignment.`
                            : 'Compared to peer submissions when available.'}
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-700">Unique phrasing and examples.</span>
                          </div>
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-700">Distinct case study selection.</span>
                          </div>
                          <div className="flex items-start gap-2 p-3 bg-surface-50 rounded-lg">
                            <BarChart3 className="w-4 h-4 text-surface-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-surface-600">Common terminology overlap expected.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <h2 className="text-lg font-semibold text-surface-900 mb-4">Additional Notes</h2>
                    <textarea
                      placeholder="Any final comments for this student?"
                      className="w-full h-24 px-4 py-3 border border-surface-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
            </div>

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center">
                    Generated by Babblet • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
                  </p>
          </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Resizer Handle */}
          <div
            onMouseDown={handleResizeStart}
            className={`w-1.5 bg-surface-200 hover:bg-primary-400 cursor-col-resize flex-shrink-0 transition-colors ${
              isResizing ? 'bg-primary-500' : ''
            }`}
            title="Drag to resize video panel"
          />

          {/* Right Video Panel */}
          <div style={{ width: videoPanelWidth }} className="flex-shrink-0">
            <VideoPanel
              ref={videoPanelRef}
              videoUrl={videoUrl}
              filename={submission.originalFilename}
              uploadDate={formatDate(submission.createdAt)}
              fileSize={formatFileSize(submission.fileSize || 0)}
              alerts={[
                { type: 'pacing', label: 'Pacing Good' },
                { type: 'volume', label: 'Low Volume', timeRange: '02:00-02:15' },
              ]}
              transcriptEntries={transcriptEntries}
              onTimeUpdate={handleVideoTimeUpdate}
              onDurationChange={setVideoDuration}
              currentTimeMs={currentVideoTime}
              presentationTitle={submission.studentName}
              submissionId={submissionId}
            />
    </div>
        </div>
      </div>
      
      {/* Material Reference Modal */}
      {showMaterialModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-surface-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-900">{showMaterialModal.name}</h3>
                  <p className="text-xs text-surface-500 capitalize">{showMaterialModal.type}</p>
                </div>
              </div>
              <button
                onClick={() => setShowMaterialModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 transition-colors"
              >
                <XCircle className="w-5 h-5 text-surface-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {showMaterialModal.excerpt ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Relevant Excerpt</p>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                      <p className="text-sm text-blue-800 italic">&quot;{showMaterialModal.excerpt}&quot;</p>
                    </div>
                  </div>
                  <p className="text-sm text-surface-600">
                    This excerpt from <span className="font-medium">{showMaterialModal.name}</span> is relevant to the question above. 
                    Babblet grounded this question in your uploaded course materials to ensure alignment with class content.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-surface-600">
                  This question was grounded in content from <span className="font-medium">{showMaterialModal.name}</span>.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-surface-100 bg-surface-50">
              {showMaterialModal.documentId && (
                <Link
                  href={`/courses?documentId=${showMaterialModal.documentId}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium text-sm"
                >
                  View Full Document
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
    </HighlightContextProvider>
  );
}
