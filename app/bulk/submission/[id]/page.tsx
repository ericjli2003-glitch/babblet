'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, Download, RefreshCw, Search, ThumbsUp, Clock,
  ChevronRight, Sparkles
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
import VideoPanel, { VideoPanelRef } from '@/components/submission/VideoPanel';

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

function getQuestionCategory(category: string): 'basic' | 'intermediate' | 'advanced' {
  const lower = category.toLowerCase();
  if (lower.includes('basic') || lower.includes('recall')) return 'basic';
  if (lower.includes('advanced') || lower.includes('synthesis')) return 'advanced';
  return 'intermediate';
}

// ============================================
// Main Component
// ============================================

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'questions' | 'rubric'>('overview');
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
  const videoPanelRef = useRef<VideoPanelRef>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

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

  // Build transcript entries for video panel sidebar
  const transcriptEntries = useMemo(() => {
    if (sortedSegments.length === 0) return [];
    return sortedSegments.slice(0, 8).map((seg, i) => {
      const timestampMs = normalizeTimestamp(seg.timestamp);
      return {
        timestamp: formatTimestamp(timestampMs),
        timestampMs: timestampMs,
        text: seg.text.slice(0, 100) + (seg.text.length > 100 ? '...' : ''),
        isHighlighted: i === currentSegmentIndex,
      };
    });
  }, [sortedSegments, currentSegmentIndex, normalizeTimestamp]);

  // Filter transcript segments by search (uses sorted segments)
  const filteredSegments = useMemo(() => {
    if (sortedSegments.length === 0) return [];
    if (!transcriptSearch) return sortedSegments;
    const lower = transcriptSearch.toLowerCase();
    return sortedSegments.filter(seg =>
      seg.text.toLowerCase().includes(lower)
    );
  }, [sortedSegments, transcriptSearch]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (activeTab === 'transcript' && currentSegmentIndex >= 0 && transcriptContainerRef.current) {
      const container = transcriptContainerRef.current;
      const currentElement = container.querySelector(`[data-segment-index="${currentSegmentIndex}"]`);
      if (currentElement) {
        // Use 'auto' for instant scroll, no animation delay
        currentElement.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }
  }, [currentSegmentIndex, activeTab]);

  // Handle seeking from transcript click
  const handleSegmentClick = useCallback((timestampMs: number) => {
    if (videoPanelRef.current) {
      videoPanelRef.current.seekTo(timestampMs);
    }
  }, []);

  // Regenerate questions with the selected count
  const handleRegenerateQuestions = useCallback(async () => {
    if (!submission || isRegenerating) return;
    
    setIsRegenerating(true);
    try {
      // Build transcript from segments
      const fullTranscript = sortedSegments.map(s => s.text).join(' ');
      
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
      
      if (data.success && data.questions) {
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
        alert('Failed to regenerate questions: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error regenerating questions:', err);
      alert('Error regenerating questions');
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
    <DashboardLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-surface-200 px-6 py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-surface-500 mb-3">
            <Link href="/courses" className="hover:text-primary-600">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/courses" className="hover:text-primary-600">
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
                  className="hover:text-primary-600"
                >
                  {batchInfo.name}
                </Link>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
            <span className="text-surface-900 font-medium">{submission.studentName}</span>
          </nav>

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
            {(['overview', 'transcript', 'questions', 'rubric'] as const).map(tab => (
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

                  {/* Course Material Alignment */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-surface-900">Course Material Alignment</h3>
                        <p className="text-sm text-surface-500">How well the presentation aligns with course content</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-primary-600">
                          {submission.analysis?.courseAlignment?.overall ?? Math.round((submission.analysis?.overallStrength || 0) * 20)}%
                        </span>
                        <p className="text-xs text-surface-500">Overall Alignment</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {(() => {
                        const alignment = submission.analysis?.courseAlignment;
                        const baseScore = submission.analysis?.overallStrength || 0;
                        // Use real data if available, otherwise derive from overallStrength
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
                  </div>

                  {/* Two Column Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Key Insights */}
                    <InsightCard
                      title="Key Insights"
                      subtitle="Strengths & areas for improvement"
                      insights={insights.length > 0 ? insights : [
                        { text: 'Clear articulation of main concepts with real-world examples.', status: 'positive' },
                        { text: 'Strong visual correlation between spoken content and slide transitions.', status: 'positive' },
                        { text: 'Conclusion could be stronger; call-to-action was brief.', status: 'negative' },
                      ]}
                    />

                    {/* Verification Findings */}
                    <VerificationCard
                      title="Verification Findings"
                      subtitle="AI confidence markers"
                      metrics={[
                        { 
                          label: 'Transcript Accuracy', 
                          sublabel: 'Based on audio clarity', 
                          value: submission.analysis?.transcriptAccuracy ?? 98, 
                          status: (submission.analysis?.transcriptAccuracy ?? 98) >= 90 ? 'high' : (submission.analysis?.transcriptAccuracy ?? 98) >= 70 ? 'medium' : 'low'
                        },
                        { 
                          label: 'Content Originality', 
                          sublabel: 'Uniqueness check', 
                          value: submission.analysis?.contentOriginality ?? 100, 
                          status: (submission.analysis?.contentOriginality ?? 100) >= 90 ? 'high' : (submission.analysis?.contentOriginality ?? 100) >= 70 ? 'medium' : 'low'
                        },
                      ]}
                    />
                  </div>

                  {/* Footer */}
                  <p className="text-xs text-surface-400 text-center pt-4">
                    Insights generated by Babblet AI v2.4 • Last updated {submission.completedAt ? formatDate(submission.completedAt) : 'recently'}
                  </p>
                </motion.div>
              )}

              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                      <input
                        type="text"
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        placeholder="Search in transcript..."
                        className="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-surface-500">
                        <span className="font-medium">Video:</span> {formatTimestamp(currentVideoTime)} / {formatTimestamp(videoDuration)}
                      </span>
                      <span className="text-sm text-primary-600 font-medium">
                        Segment {currentSegmentIndex + 1} of {sortedSegments.length}
                      </span>
                      <span className="text-sm text-surface-500">
                        <span className="font-medium">Confidence:</span> 98%
                      </span>
                      <button className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Transcript Segments */}
                  <div 
                    ref={transcriptContainerRef}
                    className="flex-1 bg-white rounded-2xl border border-surface-200 divide-y divide-surface-100 overflow-auto"
                  >
                    {filteredSegments.length > 0 ? (
                      filteredSegments.map((seg, i) => {
                        // Find index in sorted segments for current segment detection
                        const sortedIndex = sortedSegments.findIndex(s => s.id === seg.id);
                        const isCurrentSegment = sortedIndex === currentSegmentIndex;
                        const timestampMs = normalizeTimestamp(seg.timestamp);
                        return (
                          <div
                            key={seg.id}
                            data-segment-index={sortedIndex}
                            onClick={() => handleSegmentClick(timestampMs)}
                            className={`cursor-pointer transition-colors ${isCurrentSegment ? 'bg-primary-50 border-l-4 border-primary-500' : 'hover:bg-surface-50'}`}
                          >
                            <TranscriptSegment
                              timestamp={formatTimestamp(timestampMs)}
                              label={isCurrentSegment ? 'Current Segment' : (i === 0 && !transcriptSearch ? 'Introduction' : seg.label)}
                              text={seg.text}
                              isCurrentSegment={isCurrentSegment}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-surface-500">
                        No transcript segments found
                      </div>
                    )}
                  </div>
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
                          <QuestionCard
                            key={q.id}
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
                  {/* Grade Summary */}
                  <div className="bg-white rounded-2xl border border-surface-200 p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Total Grade</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-surface-900">
                            {rubric?.letterGrade || 'B+'}
                          </span>
                          <span className="text-lg text-surface-500">
                            ({Math.round(normalizedScore)}%)
                          </span>
                        </div>
                        <div className="mt-3 w-48">
                          <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 transition-all"
                              style={{ width: `${normalizedScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Grading Status</p>
                        <div className="flex items-center gap-2 text-amber-600">
                          <Sparkles className="w-4 h-4" />
                          <span className="font-medium">Draft Saved</span>
                        </div>
                        <p className="text-xs text-surface-400 mt-1">Last autosaved 2 mins ago</p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Rubric */}
                  <div>
                    <h2 className="text-lg font-semibold text-surface-900 mb-4">Detailed Rubric</h2>
                    <div className="space-y-3">
                      {rubric?.criteriaBreakdown && rubric.criteriaBreakdown.length > 0 ? (
                        rubric.criteriaBreakdown.map((c, i) => (
                          <RubricCriterion
                            key={i}
                            index={i}
                            name={c.criterion}
                            score={c.score}
                            maxScore={c.maxScore || 10}
                            scaleLabels={
                              c.criterion.toLowerCase().includes('delivery')
                                ? ['Distracted', 'Engaged', 'Professional']
                                : c.criterion.toLowerCase().includes('content')
                                  ? ['Superficial', 'Adequate', 'In-depth']
                                  : ['Poor', 'Average', 'Excellent']
                            }
                            rationale={c.rationale || c.feedback}
                          />
                        ))
                      ) : (
                        <>
                          <RubricCriterion
                            index={0}
                            name="Clarity of Speech"
                            score={9}
                            maxScore={10}
                            rationale="Excellent pacing, though volume dropped slightly at 2:00. Clear enunciation throughout the technical sections."
                          />
                          <RubricCriterion
                            index={1}
                            name="Content Depth"
                            score={42}
                            maxScore={50}
                            scaleLabels={['Superficial', 'Adequate', 'In-depth']}
                            rationale="Good coverage of market analysis, but the conclusion felt rushed. You missed discussing the competitor landscape in slide 4."
                          />
                          <RubricCriterion
                            index={2}
                            name="Delivery & Eye Contact"
                            score={8}
                            maxScore={10}
                            scaleLabels={['Distracted', 'Engaged', 'Professional']}
                            rationale=""
                          />
                        </>
                      )}
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Video Panel */}
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
            onViewFullTranscript={() => setActiveTab('transcript')}
            onTimeUpdate={handleVideoTimeUpdate}
            onDurationChange={setVideoDuration}
            currentTimeMs={currentVideoTime}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
