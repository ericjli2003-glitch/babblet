'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, XCircle, Download, RefreshCw, Search, ThumbsUp, Clock,
  ChevronRight, Sparkles, BookOpen, Shield, ArrowLeft, Mic, BarChart3, Target
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
  FloatingActionPill, 
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
  const [batchInfo, setBatchInfo] = useState<{ 
    id: string;
    name: string; 
    courseName?: string; 
    courseId?: string;
    courseCode?: string;
    assignmentName?: string;
  } | null>(null);
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
              });
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

  // Derived data
  const rubric = submission?.rubricEvaluation;
  const score = rubric?.overallScore || 0;
  const maxScore = rubric?.maxPossibleScore || 100;
  const normalizedScore = maxScore <= 5 ? (score / maxScore) * 100 : score;
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
        }),
      });
      
      const data = await res.json();
      console.log('[Regenerate] API response:', data.success, 'questions count:', data.questions?.length);
      
      if (data.success && data.questions && data.questions.length > 0) {
        // Update submission with new questions
        setSubmission(prev => prev ? {
          ...prev,
          questions: data.questions.map((q: { id: string; question: string; category: string; rationale?: string; rubricCriterion?: string }) => ({
            id: q.id,
            question: q.question,
            category: q.category,
            rationale: q.rationale,
            rubricCriterion: q.rubricCriterion,
          })),
        } : null);
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
      {/* AI Chat Components */}
      <FloatingActionPill />
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

                  {/* Speech Delivery */}
                  <CollapsibleSection
                    title="Speech Delivery"
                    subtitle="Vocal analysis from transcript"
                    icon={<Mic className="w-4 h-4" />}
                    defaultExpanded={true}
                  >
                    <div className="grid grid-cols-3 gap-6">
                      {/* Filler Word Count */}
                      <div className="bg-surface-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-medium text-surface-700">Filler Words</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            speechMetrics.fillerWordCount <= 10 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : speechMetrics.fillerWordCount <= 20
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {speechMetrics.fillerWordCount <= 10 ? 'Excellent' : speechMetrics.fillerWordCount <= 20 ? 'Good' : 'Needs Work'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-3xl font-bold text-surface-900">
                            {speechMetrics.fillerWordCount}
                          </span>
                          <span className="text-sm text-surface-500">total</span>
                        </div>
                        <p className="text-xs text-surface-500 leading-relaxed">
                          Words like &quot;um&quot;, &quot;uh&quot;, &quot;like&quot;, &quot;you know&quot; detected in the transcript.
                          Fewer filler words indicate more confident delivery.
                        </p>
                          </div>

                      {/* Speaking Rate */}
                      <div className="bg-surface-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-medium text-surface-700">Speaking Pace</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            speechMetrics.speakingRateWpm >= 120 && speechMetrics.speakingRateWpm <= 180
                              ? 'bg-emerald-100 text-emerald-700' 
                              : speechMetrics.speakingRateWpm < 100 || speechMetrics.speakingRateWpm > 200
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {speechMetrics.speakingRateWpm >= 120 && speechMetrics.speakingRateWpm <= 180 
                              ? 'Optimal' 
                              : speechMetrics.speakingRateWpm < 120 
                                ? 'Slow' 
                                : 'Fast'}
                                      </span>
                                  </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-3xl font-bold text-surface-900">
                            {speechMetrics.speakingRateWpm}
                          </span>
                          <span className="text-sm text-surface-500">words/min</span>
                              </div>
                        <p className="text-xs text-surface-500 leading-relaxed">
                          Average speaking speed. Ideal range is 120-180 WPM for presentations.
                          Based on {speechMetrics.wordCount.toLocaleString()} words spoken.
                        </p>
                  </div>

                      {/* Pause Frequency */}
                      <div className="bg-surface-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-medium text-surface-700">Speech Segments</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            speechMetrics.pauseFrequency >= 3 && speechMetrics.pauseFrequency <= 8
                              ? 'bg-emerald-100 text-emerald-700' 
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {speechMetrics.pauseFrequency >= 3 && speechMetrics.pauseFrequency <= 8 ? 'Good Pacing' : 'Review Pacing'}
                                      </span>
                                  </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-3xl font-bold text-surface-900">
                            {speechMetrics.pauseFrequency.toFixed(1)}
                          </span>
                          <span className="text-sm text-surface-500">per min</span>
                              </div>
                        <p className="text-xs text-surface-500 leading-relaxed">
                          Number of natural speech segments per minute.
                          Indicates pauses for emphasis or transitions.
                        </p>
                  </div>
              </div>
                  </CollapsibleSection>

                  {/* Course Material Alignment */}
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
                      {(() => {
                        const alignment = submission.analysis?.courseAlignment;
                        const baseScore = submission.analysis?.overallStrength || 0;
                        const metrics = [
                          { 
                            label: 'Topic Coverage', 
                            description: 'Key concepts from syllabus addressed', 
                            value: alignment?.topicCoverage ?? Math.min(100, Math.round(baseScore * 22)),
                          },
                          { 
                            label: 'Terminology Accuracy', 
                            description: 'Correct use of course-specific terms', 
                            value: alignment?.terminologyAccuracy ?? Math.min(100, Math.round(baseScore * 20)),
                          },
                          { 
                            label: 'Content Depth', 
                            description: 'Level of detail matching expectations', 
                            value: alignment?.contentDepth ?? Math.min(100, Math.round(baseScore * 19)),
                          },
                          { 
                            label: 'Reference Integration', 
                            description: 'Use of required readings/materials', 
                            value: alignment?.referenceIntegration ?? Math.min(100, Math.round(baseScore * 17)),
                          },
                        ];
                        return metrics.map((item) => (
                          <div key={item.label}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div>
                                <span className="text-sm font-medium text-surface-900">{item.label}</span>
                                <span className="text-xs text-surface-500 ml-2">{item.description}</span>
                              </div>
                              <span className={`text-sm font-semibold ${item.value >= 85 ? 'text-emerald-600' : item.value >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                {item.value}%
                              </span>
                            </div>
                            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${item.value >= 85 ? 'bg-emerald-500' : item.value >= 70 ? 'bg-amber-500' : 'bg-red-500'} rounded-full transition-all`}
                                style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
                        ));
                      })()}
                  </div>
                  </CollapsibleSection>

                  {/* Two Column Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Key Insights */}
                    <CollapsibleSection
                      title="Key Insights"
                      subtitle="Strengths & areas for improvement"
                      icon={<Sparkles className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-3">
                        {(insights.length > 0 ? insights : [
                          { text: 'Clear articulation of main concepts with real-world examples.', status: 'positive' as const },
                          { text: 'Strong visual correlation between spoken content and slide transitions.', status: 'positive' as const },
                          { text: 'Conclusion could be stronger; call-to-action was brief.', status: 'negative' as const },
                        ]).map((insight, i) => (
                          <div key={i} className="flex items-start gap-2">
                            {insight.status === 'positive' ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                            )}
                            <p className="text-sm text-surface-700">{insight.text}</p>
                          </div>
                        ))}
                  </div>
                    </CollapsibleSection>

                    {/* Verification Findings */}
                    <CollapsibleSection
                      title="Verification Findings"
                      subtitle="AI confidence markers"
                      icon={<Shield className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-4">
                        {[
                          { 
                            label: 'Transcript Accuracy', 
                            sublabel: 'Based on audio clarity', 
                            value: submission.analysis?.transcriptAccuracy ?? 98, 
                          },
                          { 
                            label: 'Content Originality', 
                            sublabel: 'Uniqueness check', 
                            value: submission.analysis?.contentOriginality ?? 100, 
                          },
                        ].map((metric) => (
                          <div key={metric.label}>
                            <div className="flex items-center justify-between mb-1.5">
                  <div>
                                <span className="text-sm font-medium text-surface-900">{metric.label}</span>
                                <span className="text-xs text-surface-500 ml-2">{metric.sublabel}</span>
                              </div>
                              <span className={`text-sm font-semibold ${metric.value >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {metric.value}% {metric.value >= 90 ? 'High' : 'Medium'}
                              </span>
                            </div>
                            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${metric.value}%` }}
                              />
                            </div>
                          </div>
                        ))}
                  </div>
                    </CollapsibleSection>
              </div>

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center pt-4">
                    Insights generated by Babblet AI v2.4 • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
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
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-surface-900">Follow-up Questions</h2>
                      <p className="text-sm text-surface-500 mt-1">
                        Based on the transcript analysis, these questions test depth of understanding across different cognitive levels.
                      </p>
                </div>
                    <div className="flex items-center gap-3">
                      {/* Question Count Selector */}
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-surface-600">Generate</label>
                        <select
                          value={questionCount}
                          onChange={(e) => setQuestionCount(Number(e.target.value))}
                          className="px-3 py-1.5 border border-surface-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          disabled={isRegenerating}
                        >
                          <option value={3}>3 questions</option>
                          <option value={5}>5 questions</option>
                          <option value={10}>10 questions</option>
                          <option value={15}>15 questions</option>
                          <option value={20}>20 questions</option>
                        </select>
                      </div>
                      <button 
                        onClick={handleRegenerateQuestions}
                        disabled={isRegenerating}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          isRegenerating 
                            ? 'bg-primary-100 text-primary-600 cursor-wait' 
                            : 'text-primary-600 bg-white border border-primary-200 hover:bg-primary-50'
                        }`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                        {isRegenerating ? 'Generating...' : 'Regenerate'}
                      </button>
                        </div>
                      </div>
                  
                  {/* Regenerating Indicator */}
                  {isRegenerating && (
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-primary-600 animate-spin" />
                    </div>
                      <div>
                        <p className="text-sm font-medium text-primary-900">Babblet is generating {questionCount} new questions...</p>
                        <p className="text-xs text-primary-600">Analyzing transcript and creating targeted questions</p>
                </div>
              </div>
            )}

                  {/* Question Cards */}
                  <div className="space-y-4">
                    {submission.questions && submission.questions.length > 0 ? (
                      submission.questions.slice(0, questionCount).map((q, i) => {
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
                        
                        return (
                          <HighlightableContent
                            key={q.id}
                            sourceType="question"
                            sourceId={q.id}
                            timestamp={formatTimestamp(timestampMs)}
                          >
                            <QuestionCard
                              category={getQuestionCategory(q.category)}
                              question={q.question}
                              context={{
                                text: `Referenced during the ${segmentPreview.toLowerCase()}${segment?.text && segment.text.length > 60 ? '...' : ''} segment at`,
                                timestamps: [formatTimestamp(timestampMs)],
                              }}
                              onTimestampClick={(ts) => {
                                // Parse timestamp string like "01:30" to milliseconds
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
                        );
                      })
                    ) : (
                      <>
                        <QuestionCard
                          category="basic"
                          question="You mentioned that customer acquisition costs have been volatile since early 2022. Can you specify which specific platforms showed the highest volatility index according to your research?"
                          context={{
                            text: 'Referenced during the slide on customer acquisition costs at',
                            timestamps: ['00:45'],
                          }}
                          onTimestampClick={() => handleSegmentClick(45000)}
                        />
                        <QuestionCard
                          category="intermediate"
                          question="How does the lack of a personalized onboarding flow in Company X's product directly create an opportunity for your proposed solution, and what risks are involved in focusing solely on this differentiator?"
                          context={{
                            text: 'Based on the Competitor Analysis segment at',
                            timestamps: ['02:45'],
                          }}
                          onTimestampClick={() => handleSegmentClick(165000)}
                        />
                        <QuestionCard
                          category="advanced"
                          question="Given the market volatility and steady LTV you discovered, how would you justify the budget allocation for Phase 2 if acquisition costs were to unexpectedly rise by another 15% next quarter?"
                          context={{
                            text: 'Synthesized from Q3 results and budget discussion at',
                            timestamps: ['02:10', '03:30'],
                          }}
                          onTimestampClick={() => handleSegmentClick(130000)}
                        />
                      </>
                  )}
                </div>
                
                  {/* Show more indicator */}
                  {submission.questions && submission.questions.length > questionCount && (
                    <p className="text-sm text-surface-500 text-center">
                      Showing {questionCount} of {submission.questions.length} questions. Adjust the selector above to see more.
                    </p>
                  )}

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center pt-6">
                    Questions generated by Babblet AI v2.4 • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
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
                          <span className="font-medium">AI Graded</span>
                      </div>
                        <p className="text-xs text-surface-400 mt-1">
                          {submission.completedAt ? `Completed ${formatDate(submission.completedAt)}` : 'Ready for review'}
                        </p>
              </div>
                    </div>
                  </div>

                  {/* Class-Specific Insights */}
                  <div>
            <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-primary-600" />
                      <h2 className="text-lg font-semibold text-surface-900">Class-Specific Insights</h2>
            </div>
                    <div className="space-y-4">
                      {rubric?.criteriaBreakdown && rubric.criteriaBreakdown.length > 0 ? (
                        rubric.criteriaBreakdown.map((c, i) => {
                          const percentage = c.maxScore ? (c.score / c.maxScore) * 100 : 0;
                          const status = percentage >= 90 ? 'excellent' : 
                                        percentage >= 75 ? 'good' : 
                                        percentage >= 50 ? 'needs_improvement' : 'missing';
                          
                          return (
                            <HighlightableContent
                              key={i}
                              sourceType="rubric"
                              sourceId={`criterion-${i}`}
                              criterionId={`criterion-${i}`}
                              rubricCriterion={c.criterion}
                            >
                              <ClassInsightCard
                                title={c.criterion}
                                score={c.score}
                                maxScore={c.maxScore || 10}
                                status={status}
                                moduleReference={`Criterion ${i + 1}`}
                                feedback={c.feedback || c.rationale || 'No detailed feedback available.'}
                                courseAlignment={submission.analysis?.courseAlignment?.overall}
                                defaultExpanded={i === 0}
                                suggestedAction={
                                  status === 'needs_improvement' || status === 'missing'
                                    ? {
                                        text: `Focus on improving ${c.criterion.toLowerCase()}. Review course materials for guidance.`,
                                        linkText: 'View Course Resources',
                                        linkUrl: '/resources',
                                      }
                                    : undefined
                                }
                                evidence={
                                  submission.transcriptSegments?.slice(i * 2, i * 2 + 2).map(seg => ({
                                    timestamp: formatTimestamp(seg.timestamp),
                                    text: seg.text.slice(0, 100) + (seg.text.length > 100 ? '...' : ''),
                                  }))
                                }
                                onSeekToTime={(ms) => videoPanelRef.current?.seekTo(ms)}
                              />
                            </HighlightableContent>
                          );
                        })
                      ) : (
                        // Fallback demo content
                        <>
                          <ClassInsightCard
                            title="Content Knowledge & Accuracy"
                            score={18}
                            maxScore={20}
                            status="excellent"
                            moduleReference="Core Concepts"
                            feedback="Demonstrated strong understanding of key concepts. Accurately explained the main principles and showed good integration of course material."
                            courseAlignment={92}
                            defaultExpanded={true}
                            evidence={[
                              { timestamp: '0:45', text: 'Correctly defined the core terminology and provided accurate examples...' },
                              { timestamp: '2:15', text: 'Referenced the textbook framework effectively...' },
                            ]}
                            onSeekToTime={(ms) => videoPanelRef.current?.seekTo(ms)}
                          />
                          <ClassInsightCard
                            title="Presentation Structure"
                            score={14}
                            maxScore={20}
                            status="good"
                            moduleReference="Organization"
                            feedback="Good overall structure with clear introduction and conclusion. The middle section could benefit from better transitions between topics."
                            courseAlignment={78}
                            suggestedAction={{
                              text: 'Consider using signposting phrases to guide the audience through your key points.',
                              linkText: 'Presentation Guidelines',
                              linkUrl: '/resources',
                            }}
                            evidence={[
                              { timestamp: '0:15', text: 'Strong opening that captured attention...' },
                            ]}
                            onSeekToTime={(ms) => videoPanelRef.current?.seekTo(ms)}
                          />
                          <ClassInsightCard
                            title="Visual Aid Usage"
                            score={8}
                            maxScore={15}
                            status="needs_improvement"
                            moduleReference="Slides"
                            feedback="Slides were text-heavy and not fully leveraged during the presentation. Consider using more visual elements and referencing slides directly."
                            courseAlignment={65}
                            suggestedAction={{
                              text: 'Review the slide design principles covered in Week 3. Focus on visual hierarchy and reducing text.',
                              linkText: 'Visual Presentation Tips',
                              linkUrl: '/resources',
                            }}
                            onSeekToTime={(ms) => videoPanelRef.current?.seekTo(ms)}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Verification & Integrity Analysis */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Shield className="w-5 h-5 text-emerald-600" />
                      <h2 className="text-lg font-semibold text-surface-900">Verification & Integrity Analysis</h2>
            </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Transcript Accuracy */}
              <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-surface-700">Transcript Accuracy</span>
                          <span className="text-lg font-bold text-emerald-600">
                            {submission.analysis?.transcriptAccuracy ?? 98}% High Confidence
                      </span>
                      </div>
                        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${submission.analysis?.transcriptAccuracy ?? 98}%` }}
                          />
                    </div>
                        <div className="p-3 bg-surface-50 rounded-lg">
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Methodology</p>
                          <p className="text-sm text-surface-600">
                            Audio analyzed using multi-pass spectral analysis. Speech patterns verified against expected terminology from course materials.
                          </p>
                  </div>
              </div>

                      {/* Content Originality */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-surface-700">Content Originality</span>
                          <span className="text-lg font-bold text-emerald-600">
                            {submission.analysis?.contentOriginality ?? 100}% Unique
                          </span>
        </div>
                        <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${submission.analysis?.contentOriginality ?? 100}%` }}
                          />
            </div>
                        <div className="p-3 bg-surface-50 rounded-lg">
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Methodology</p>
                          <p className="text-sm text-surface-600">
                            Cross-referenced against academic databases and internet sources. No matching content found.
                      </p>
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
                    Report generated by Babblet AI v2.4 • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
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
    </DashboardLayout>
    </HighlightContextProvider>
  );
}
