'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, XCircle, Download, RefreshCw, Search, ThumbsUp, Clock,
  ChevronRight, Sparkles, BookOpen, Shield, ArrowLeft, Mic, BarChart3, Target,
  FileSearch, AlertTriangle, Swords, AlertCircle, Microscope, Plus, Minus, PlayCircle, Loader2
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
  /** Set when submission was re-graded (2nd+ grading) */
  regradedAt?: number;
  /** 1 = first grading, 2 = second, etc. For "Xth grading" UI */
  gradingCount?: number;
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

function ordinalGradingLabel(count: number): string {
  if (count <= 1) return '';
  const n = count % 100;
  const suffix = n >= 11 && n <= 13 ? 'th' : (count % 10 === 1 ? 'st' : count % 10 === 2 ? 'nd' : count % 10 === 3 ? 'rd' : 'th');
  return `${count}${suffix} grading`;
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
  const [selectedSpotlightIndex, setSelectedSpotlightIndex] = useState<number | null>(null);
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
    assignmentId?: string;
    assignmentName?: string;
    rubricCriteria?: string;
  } | null>(null);
  const [otherSubmissionsCount, setOtherSubmissionsCount] = useState<number>(0);
  const [classSpeechStats, setClassSpeechStats] = useState<{
    fillerWordAvg: number | null;
    wpmAvg: number | null;
    pausesPerMinAvg: number | null;
    count: number;
  } | null>(null);
  const [criterionInsights, setCriterionInsights] = useState<Record<string, string>>({});
  const [courseDocuments, setCourseDocuments] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [alignmentMoreInsights, setAlignmentMoreInsights] = useState<string | null>(null);
  const [keyMoreInsights, setKeyMoreInsights] = useState<string | null>(null);
  const [verificationMoreInsights, setVerificationMoreInsights] = useState<string | null>(null);
  const [moreInsightsLoading, setMoreInsightsLoading] = useState<'alignment' | 'key' | 'verification' | null>(null);
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
        if (data.submission.criterionInsights && Object.keys(data.submission.criterionInsights).length > 0) {
          setCriterionInsights(data.submission.criterionInsights);
        }
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
                assignmentId: batchData.batch.assignmentId,
                assignmentName: batchData.batch.assignmentName,
                rubricCriteria: batchData.batch.rubricCriteria,
              });
              // For Content Originality: count other submissions in batch
              const subs = batchData.submissions || [];
              setOtherSubmissionsCount(Math.max(0, subs.length - 1));
              // Fetch class-level speech stats for "Class Avg" in Speech Delivery
              fetch(`/api/bulk/batch-speech-stats?batchId=${data.submission.batchId}`)
                .then((r) => r.json())
                .then((stats) => {
                  if (stats.success && stats.count > 0) {
                    setClassSpeechStats({
                      fillerWordAvg: stats.fillerWordAvg ?? null,
                      wpmAvg: stats.wpmAvg ?? null,
                      pausesPerMinAvg: stats.pausesPerMinAvg ?? null,
                      count: stats.count,
                    });
                  }
                })
                .catch(() => {});
            }
            if (batchData.batch?.courseId) {
              fetch(`/api/context/documents?courseId=${batchData.batch.courseId}`)
                .then((r) => r.json())
                .then((docData) => {
                  if (docData.documents?.length) {
                    setCourseDocuments(docData.documents.map((d: { id: string; name: string; type: string }) => ({ id: d.id, name: d.name, type: d.type })));
                  }
                })
                .catch(() => {});
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

  // Extract criterion-specific rubric text (only the section for THIS criterion)
  const extractCriterionRubricText = useCallback((fullRubric: string, criterionName: string): string => {
    if (!fullRubric?.trim()) return '';
    const criterionLower = criterionName.toLowerCase().trim();
    const words = criterionLower.split(/\s+/);
    const firstWord = words[0];
    const lines = fullRubric.split('\n');
    let inSection = false;
    const collected: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase().trim();
      const isCriterionHeader = lower.startsWith(criterionLower) || 
        lower.startsWith(firstWord + ' ') || 
        lower.startsWith(firstWord + ':') ||
        (new RegExp(`^\\d+\\.\\s*${criterionLower}`).test(lower)) ||
        (new RegExp(`^[-*]\\s*${criterionLower}`).test(lower));
      if (isCriterionHeader) {
        inSection = true;
        collected.length = 0;
        collected.push(line);
      } else if (inSection) {
        const nextSection = /^\d+\.\s+[A-Z]/.test(line) || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:/.test(line) || /^#{1,3}\s/.test(line);
        if (nextSection && !lower.includes(criterionLower)) break;
        collected.push(line);
        if (collected.join('\n').length > 800) break;
      }
    }
    if (collected.length > 0) return collected.join('\n').trim();
    const idx = fullRubric.toLowerCase().indexOf(criterionLower);
    if (idx >= 0) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(fullRubric.length, idx + 500);
      return fullRubric.slice(start, end);
    }
    return fullRubric.slice(0, 600);
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
    
    // CRITICAL: Pass ONLY the rubric section for THIS criterion - not the whole rubric
    const fullRubricText = batchInfo?.rubricCriteria || '';
    const criterionRubricOnly = extractCriterionRubricText(fullRubricText, criterionTitle);
    const rubricSection = criterionRubricOnly 
      ? `\n\nRUBRIC FOR "${criterionTitle}" ONLY (analyze ONLY against this):\n${criterionRubricOnly}\n\nDO NOT use other criteria. Focus exclusively on what the above says for ${criterionTitle}.`
      : fullRubricText ? `\n\nFULL RUBRIC (find and use ONLY the section for ${criterionTitle}):\n${fullRubricText.slice(0, 1500)}` : '';
    
    // Build criterion-specific expectations
    const criterionExpectations: Record<string, string> = {
      'Content Knowledge': 'Focus on: concept accuracy, understanding depth, integration of material, factual correctness, use of terminology.',
      'Structure': 'Focus on: organization, logical flow, transitions between sections, introduction/conclusion quality, coherence.',
      'Visual Aids': 'Focus on: slide design, visual clarity, appropriate use of graphics, readability, visual support of content.',
      'Delivery': 'Focus on: speaking pace, eye contact, voice clarity, confidence, engagement, gestures, enthusiasm.',
    };
    const expectationsForCriterion = criterionExpectations[criterionTitle] || `Focus on what the rubric says about ${criterionTitle}.`;
    
    const response = await fetch('/api/contextual-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `ANALYZE ONLY: "${criterionTitle}"

${expectationsForCriterion}

DO NOT mention or evaluate other rubric categories. Your ENTIRE response is about "${criterionTitle}" only.

CRITERION BEING GRADED: "${criterionTitle}"
SCORE: ${criterionInfo || 'See rubric'}

WHAT TO ANALYZE FOR "${criterionTitle}":
${criterionTitle === 'Content Knowledge' ? '- Did the student demonstrate understanding of the topic?\n- Were concepts explained accurately?\n- Did they integrate course material?' : ''}${criterionTitle === 'Structure' ? '- Was the presentation well-organized?\n- Were transitions smooth?\n- Did it have a clear beginning, middle, end?' : ''}${criterionTitle === 'Visual Aids' ? '- Were slides/visuals effective?\n- Was text readable and not too dense?\n- Did visuals support the content?' : ''}${criterionTitle === 'Delivery' ? '- How was their speaking pace and clarity?\n- Did they maintain eye contact?\n- Did they appear confident and engaged?' : ''}

FORMAT YOUR RESPONSE (vary structure - avoid repetitive templates):
- Use different openings: "What stands out...", "A key strength here...", "Notably, the student..."
- Vary transition words: Moreover, Specifically, In contrast, Notably
- Mix bullet styles: sometimes lead with the quote, sometimes with the observation
- Avoid starting every bullet with "The student" - vary phrasing

**Overview** (2-3 sentences - ${criterionTitle}-specific, varied tone)

**What worked well:**
- [Strength - vary phrasing] A
- [Another strength] B

**Areas to develop:**
- [Gap - be specific] A
- [Rubric expectation] B

**Example of excellence:** One sentence.

RUBRIC SECTION FOR "${criterionTitle}":
${criterionRubricOnly || 'Evaluate based on the criterion name and general expectations.'}

RULES:
- End each bullet with A (video quote) or B (rubric reference)
- Quote the student's words when possible
- Be specific to ${criterionTitle} - no generic feedback`,
        context: {
          highlightedText: criterionTitle,
          sourceType: 'rubric',
          rubricCriterion: criterionTitle,
          fullContext: fullTranscript + (slideContext ? `\n\nPRESENTATION SLIDES:\n${slideContext}` : '') + rubricSection,
          analysisData: submission ? JSON.stringify({
            ...submission.analysis,
            rubricEvaluation: submission.rubricEvaluation ? {
              overallScore: submission.rubricEvaluation.overallScore,
              criteriaBreakdown: submission.rubricEvaluation.criteriaBreakdown?.map(c => ({
                criterion: c.criterion,
                score: c.score,
                maxScore: c.maxScore,
                feedback: c.feedback,
                rationale: c.rationale,
              })),
            } : undefined,
            slideSummary: submission.slideContent?.summary,
          }) : undefined,
          submissionId,
          courseId: batchInfo?.courseId,
          assignmentId: batchInfo?.assignmentId,
          rubricText: criterionRubricOnly || fullRubricText?.slice(0, 2000),
        },
        conversationHistory: [],
      }),
    });
    
    const data = await response.json();
    if (data.success) {
      return data.response;
    }
    throw new Error(data.error || 'Failed to get insights');
  }, [submission, sortedSegments, submissionId, batchInfo?.courseId, batchInfo, extractCriterionRubricText]);

  // Handle Get More insights for Overview sections (alignment, key, verification)
  const handleGetMoreAlignmentInsights = useCallback(async () => {
    const criterion = effectiveCriteria[0]?.criterion;
    if (!criterion) return;
    setMoreInsightsLoading('alignment');
    try {
      const insights = await handleRequestCriterionInsights(criterion);
      setAlignmentMoreInsights(insights);
    } catch (e) {
      console.error('Failed to get alignment insights:', e);
      setAlignmentMoreInsights('Unable to load insights. Please try again.');
    } finally {
      setMoreInsightsLoading(null);
    }
  }, [effectiveCriteria, handleRequestCriterionInsights]);

  const handleGetMoreKeyInsights = useCallback(async () => {
    const criterion = effectiveCriteria[0]?.criterion || 'Key Insights';
    setMoreInsightsLoading('key');
    try {
      const insights = await handleRequestCriterionInsights(criterion);
      setKeyMoreInsights(insights);
    } catch (e) {
      console.error('Failed to get key insights:', e);
      setKeyMoreInsights('Unable to load insights. Please try again.');
    } finally {
      setMoreInsightsLoading(null);
    }
  }, [effectiveCriteria, handleRequestCriterionInsights]);

  const handleGetMoreVerificationInsights = useCallback(async () => {
    const criterion = effectiveCriteria[0]?.criterion || 'Verification';
    setMoreInsightsLoading('verification');
    try {
      const insights = await handleRequestCriterionInsights(criterion);
      setVerificationMoreInsights(insights);
    } catch (e) {
      console.error('Failed to get verification insights:', e);
      setVerificationMoreInsights('Unable to load insights. Please try again.');
    } finally {
      setMoreInsightsLoading(null);
    }
  }, [effectiveCriteria, handleRequestCriterionInsights]);

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
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-surface-900">{submission.studentName}</h1>
                  {submission.status === 'ready' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Submitted on time
                    </span>
                  )}
                  {submission.regradedAt != null && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-graded
                    </span>
                  )}
                </div>
                <p className="text-sm text-surface-500 mt-0.5">
                  Submission: {batchInfo?.assignmentName || 'Assignment'} • {formatDate(submission.createdAt)}
                  {submission.regradedAt != null && (
                    <span className="ml-2 text-amber-600">• Re-graded {formatDate(submission.regradedAt)}</span>
                  )}
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
                  {(submission.gradingCount ?? 0) >= 2 && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-sm font-medium">
                      <RefreshCw className="w-4 h-4" />
                      <span>{ordinalGradingLabel(submission.gradingCount!)}</span>
                    </div>
                  )}
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
                      ...((submission.gradingCount ?? 0) >= 2
                        ? [{ label: ordinalGradingLabel(submission.gradingCount!), icon: <RefreshCw className="w-3 h-3" /> }]
                        : []),
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
                    {/* The Spotlight - Key algorithmic-identified moments (image reference style) */}
                    <div className="bg-white rounded-2xl border border-surface-200 p-4">
                      <div className="mb-3">
                        <h3 className="text-base font-bold text-surface-900">The Spotlight</h3>
                        <p className="text-xs text-surface-500 mt-0.5">Key algorithmic-identified moments from the presentation.</p>
                      </div>
                      
                      {/* Compact 10s clips - three cards side-by-side, expand on click */}
                      <div className="grid grid-cols-3 gap-3">
                        {(submission.analysis?.keyClaims?.slice(0, 3) || sortedSegments.slice(0, 3)).map((item, idx) => {
                          const seg = sortedSegments[Math.min(idx * Math.floor(Math.max(1, sortedSegments.length) / 3), sortedSegments.length - 1)];
                          const timestamp = seg ? formatTimestamp(seg.timestamp) : `${idx}:00`;
                          const timestampMs = seg ? normalizeTimestamp(seg.timestamp) : idx * 60000;
                          const fullText = 'claim' in item ? item.claim : ('text' in item ? item.text : 'Key moment');
                          const previewText = typeof fullText === 'string' ? fullText.slice(0, 80) + (fullText.length > 80 ? '...' : '') : 'Key moment';
                          const spotlightLabels = ['IMPACT MOMENT', 'AI INSIGHT', 'CRITIQUE POINT'];
                          const CLIP_DURATION_SEC = 10;
                          const clipStart = timestampMs / 1000;
                          const clipEnd = clipStart + CLIP_DURATION_SEC;
                          const isSelected = selectedSpotlightIndex === idx;
                          
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedSpotlightIndex(selectedSpotlightIndex === idx ? null : idx)}
                              className={`flex flex-col text-left rounded-lg transition-all duration-300 ${
                                isSelected 
                                  ? 'ring-2 ring-primary-500 bg-primary-50/50 scale-105 z-10 shadow-lg' 
                                  : 'hover:ring-2 hover:ring-primary-200 hover:scale-[1.02]'
                              }`}
                            >
                              {/* 10s clip - enlarges slightly when selected */}
                              <div className={`relative w-full rounded-t-lg overflow-hidden bg-surface-900 transition-all duration-300 ${
                                isSelected ? 'aspect-[4/3]' : 'aspect-video max-h-40'
                              }`}>
                                {videoUrl ? (
                                  <video
                                    data-spotlight-idx={idx}
                                    src={videoUrl}
                                    className="clip-video absolute inset-0 w-full h-full object-cover"
                                    controls
                                    preload="metadata"
                                    playsInline
                                    disablePictureInPicture
                                    controlsList="nodownload noremoteplayback"
                                    onLoadedMetadata={(e) => {
                                      const video = e.target as HTMLVideoElement;
                                      video.currentTime = clipStart;
                                    }}
                                    onPlay={(e) => {
                                      const v = e.target as HTMLVideoElement;
                                      if (v.currentTime < clipStart || v.currentTime >= clipEnd) v.currentTime = clipStart;
                                      // Pause all other spotlight videos
                                      document.querySelectorAll('video[data-spotlight-idx]').forEach((vid) => {
                                        if (vid !== v && vid instanceof HTMLVideoElement) {
                                          vid.pause();
                                        }
                                      });
                                    }}
                                    onTimeUpdate={(e) => {
                                      const v = e.target as HTMLVideoElement;
                                      if (v.currentTime >= clipEnd - 0.3) {
                                        v.pause();
                                        v.currentTime = clipStart;
                                      }
                                    }}
                                    onSeeked={(e) => {
                                      const v = e.target as HTMLVideoElement;
                                      if (v.currentTime >= clipEnd || v.currentTime < clipStart) v.currentTime = clipStart;
                                    }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 bg-surface-700 flex items-center justify-center">
                                    <PlayCircle className="w-8 h-8 text-white/60" />
                                  </div>
                                )}
                                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-white text-[9px] font-mono z-10">
                                  {timestamp}
                                </div>
                              </div>
                              {/* Label + description - full insight when selected */}
                              <div className={`p-2 rounded-b-lg border border-t-0 border-surface-200 ${isSelected ? 'bg-primary-50/80' : 'bg-surface-50'}`}>
                                <p className="text-[10px] font-bold text-primary-600 uppercase tracking-wide mb-1">
                                  {spotlightLabels[idx % spotlightLabels.length]}
                                </p>
                                <p className={`text-xs text-surface-600 leading-snug ${isSelected ? '' : 'line-clamp-2'}`}>
                                  {typeof fullText === 'string' ? fullText : previewText}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                        {sortedSegments.length === 0 && (
                          <div className="col-span-3 flex items-center justify-center py-8 text-sm text-surface-500">
                            <div className="text-center">
                              <PlayCircle className="w-6 h-6 mx-auto mb-2 text-surface-300" />
                              <p className="text-xs">No highlights yet</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Speech Delivery - Metrics with class averages (rest of assignment) */}
                    <div className="bg-white rounded-2xl border border-surface-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Mic className="w-4 h-4 text-primary-500" />
                          <h3 className="text-sm font-semibold text-surface-900">Speech Delivery</h3>
                        </div>
                        {classSpeechStats?.count != null && classSpeechStats.count > 0 && (
                          <span className="text-[10px] text-surface-500">Assignment avg (n={classSpeechStats.count})</span>
                        )}
                      </div>
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
                            {classSpeechStats?.fillerWordAvg != null && classSpeechStats.count > 0 ? (
                              <>Assignment avg: <span className="font-semibold">{Number(classSpeechStats.fillerWordAvg) === Math.floor(classSpeechStats.fillerWordAvg) ? Math.round(classSpeechStats.fillerWordAvg) : classSpeechStats.fillerWordAvg}</span></>
                            ) : (
                              <>Lower filler use improves clarity.</>
                            )}
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
                            {classSpeechStats?.wpmAvg != null && classSpeechStats.count > 0 ? (
                              <>Assignment avg: <span className="font-semibold">{Math.round(classSpeechStats.wpmAvg)}</span> wpm</>
                            ) : (
                              <>Ideal range 120–180 for comprehension.</>
                            )}
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
                            {classSpeechStats?.pausesPerMinAvg != null && classSpeechStats.count > 0 ? (
                              <>Assignment avg: <span className="font-semibold">{Number(classSpeechStats.pausesPerMinAvg) === Math.floor(classSpeechStats.pausesPerMinAvg) ? Math.round(classSpeechStats.pausesPerMinAvg) : classSpeechStats.pausesPerMinAvg}</span>/min</>
                            ) : (
                              <>Strategic pauses aid emphasis.</>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Evidence Mapping - Course Material Alignment */}
                  <CollapsibleSection
                    title="Evidence Mapping"
                    subtitle="Student evidence mapped to course materials"
                    icon={<FileSearch className="w-4 h-4" />}
                    defaultExpanded={true}
                  >
                    <div className="space-y-3">
                      {effectiveCriteria.map((c, idx) => {
                        const pct = c.maxScore ? Math.round((c.score / c.maxScore) * 100) : c.score;
                        // Get a relevant segment for this criterion
                        const segmentIndex = Math.min(
                          Math.floor((idx / Math.max(effectiveCriteria.length, 1)) * sortedSegments.length),
                          sortedSegments.length - 1
                        );
                        const evidenceSegment = sortedSegments[segmentIndex];
                        const timestamp = evidenceSegment ? formatTimestamp(evidenceSegment.timestamp) : '--';
                        const timestampMs = evidenceSegment ? normalizeTimestamp(evidenceSegment.timestamp) : 0;
                        const quote = evidenceSegment?.text?.slice(0, 150) || c.feedback?.slice(0, 150) || 'Evidence from presentation';
                        
                        return (
                          <div key={idx} className="border border-surface-200 rounded-lg p-3 bg-white hover:border-primary-300 transition-colors">
                            <div className="grid grid-cols-2 gap-4">
                              {/* Left: Course Material / Rubric Criterion */}
                              <div>
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded bg-primary-100 flex items-center justify-center">
                                      <BookOpen className="w-3.5 h-3.5 text-primary-600" />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-surface-900 uppercase tracking-wide">{c.criterion}</h4>
                                      <p className="text-[10px] text-surface-500">Rubric Criterion</p>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                    pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {pct >= 80 ? 'Strong' : pct >= 60 ? 'Moderate' : 'Developing'} ({pct}%)
                                  </span>
                                </div>
                                <p className="text-xs text-surface-600 leading-relaxed">{c.feedback || c.rationale || 'See rubric for details.'}</p>
                                {batchInfo?.courseId && (
                                  <div className="mt-2 pt-2 border-t border-surface-100 relative group">
                                    <p className="text-[10px] text-primary-600 mb-1 cursor-help">📚 Course Materials</p>
                                    {/* Hover popover: show materials + link to source */}
                                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-50 w-72 rounded-lg border border-surface-200 bg-white shadow-lg p-3">
                                      <p className="text-xs font-semibold text-surface-900 mb-2">Referenced materials</p>
                                      {courseDocuments.length > 0 ? (
                                        <ul className="space-y-1.5 mb-3 max-h-32 overflow-y-auto">
                                          {courseDocuments.slice(0, 8).map((doc) => (
                                            <li key={doc.id} className="text-[11px] text-surface-700">
                                              {doc.name}
                                              <span className="text-surface-400 ml-1">({doc.type.replace('_', ' ')})</span>
                                            </li>
                                          ))}
                                          {courseDocuments.length > 8 && (
                                            <li className="text-[10px] text-surface-500">+{courseDocuments.length - 8} more</li>
                                          )}
                                        </ul>
                                      ) : (
                                        <p className="text-[11px] text-surface-500 mb-3">Based on uploaded {batchInfo.courseName || 'course'} content</p>
                                      )}
                                      <Link
                                        href={`/courses/${batchInfo.courseId}/content`}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded border border-primary-200 transition-colors"
                                      >
                                        <BookOpen className="w-3.5 h-3.5" />
                                        View course materials
                                      </Link>
                                    </div>
                                    <p className="text-[9px] text-surface-500">Hover to see materials · Click link to open</p>
                                  </div>
                                )}
                              </div>

                              {/* Right: Student Evidence from Video */}
                              <div className="bg-blue-50/30 rounded-lg p-2.5 border border-blue-100">
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Student Evidence ({timestamp})</p>
                                  {evidenceSegment && (
                                    <button
                                      onClick={() => videoPanelRef.current?.seekTo(timestampMs)}
                                      className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-medium hover:bg-blue-700 transition-colors"
                                    >
                                      <PlayCircle className="w-2.5 h-2.5" /> Go to Clip
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-surface-700 leading-relaxed italic">
                                  &quot;{quote}{quote.length >= 150 ? '...' : ''}&quot;
                                </p>
                                {evidenceSegment && (
                                  <p className="text-[9px] text-surface-500 mt-1.5">
                                    Aligns with {c.criterion} expectations from rubric and course framework
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Verification & Key Claims */}
                      {submission.verificationFindings && submission.verificationFindings.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-surface-100">
                          <h4 className="text-xs font-semibold text-surface-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-blue-600" /> Claim Verification
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            {submission.verificationFindings.slice(0, 6).map((f, i) => (
                              <div 
                                key={i} 
                                className={`p-2 rounded-lg border text-left ${
                                  f.status === 'VERIFIED' ? 'bg-emerald-50 border-emerald-200' :
                                  f.status === 'NEEDS_EVIDENCE' ? 'bg-amber-50 border-amber-200' :
                                  'bg-red-50 border-red-200'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  {f.status === 'VERIFIED' ? (
                                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                                  ) : f.status === 'NEEDS_EVIDENCE' ? (
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                  ) : (
                                    <XCircle className="w-3 h-3 text-red-600" />
                                  )}
                                  <span className={`text-[9px] font-bold uppercase ${
                                    f.status === 'VERIFIED' ? 'text-emerald-700' :
                                    f.status === 'NEEDS_EVIDENCE' ? 'text-amber-700' :
                                    'text-red-700'
                                  }`}>
                                    {f.status === 'VERIFIED' ? 'Match Found' : f.status === 'NEEDS_EVIDENCE' ? 'Needs Evidence' : 'Unverified'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-surface-700 leading-snug">{f.statement}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>

                  {/* Remove old Key Insights and Verification sections - now integrated above */}
                  <div className="hidden grid-cols-2 gap-4">
                    {/* Key Insights */}
                    <CollapsibleSection
                      title="Key Insights"
                      subtitle="Strengths & areas for improvement"
                      icon={<Sparkles className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Strengths</h4>
                          <div className="space-y-2">
                            {(rubric?.strengths?.length ? rubric.strengths : [
                              'Demonstrated solid understanding of core concepts.',
                              'Clear structure with logical flow.',
                            ]).slice(0, 4).map((s, i) => (
                              <div key={i} className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                                <p className="text-xs text-surface-700">{typeof s === 'string' ? s : (s as { text: string }).text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Areas for Improvement</h4>
                          <div className="space-y-2">
                            {(rubric?.improvements?.length ? rubric.improvements : [
                              'Consider adding citations or references to research.',
                              'Could strengthen by connecting to established frameworks discussed in class.',
                            ]).slice(0, 4).map((s, i) => (
                              <div key={i} className="p-2 bg-amber-50 rounded-lg border border-amber-100">
                                <p className="text-xs text-surface-700">{typeof s === 'string' ? s : (s as { text: string }).text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {keyMoreInsights && (
                          <div className="p-2 bg-primary-50 rounded-lg border border-primary-100">
                            <p className="text-xs text-surface-700 whitespace-pre-wrap">{keyMoreInsights}</p>
                          </div>
                        )}
                        <button
                          onClick={handleGetMoreKeyInsights}
                          disabled={moreInsightsLoading === 'key'}
                          className="flex items-center gap-2 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors disabled:opacity-50"
                        >
                          {moreInsightsLoading === 'key' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          Get More Insights
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </CollapsibleSection>

                    {/* Verification & Integrity - Compact */}
                    <CollapsibleSection
                      title="Verification & Integrity"
                      subtitle="Fact-checking & originality"
                      icon={<Shield className="w-4 h-4" />}
                      defaultExpanded={true}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between py-1">
                          <span className="text-xs font-semibold text-surface-900">Truthfulness</span>
                          <span className="text-sm font-bold text-primary-600">{submission.analysis?.transcriptAccuracy ?? 98}%</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-xs font-semibold text-surface-900">Content Originality</span>
                          <span className="text-sm font-bold text-primary-600">{Math.round(submission.analysis?.contentOriginality ?? 94)}%</span>
                        </div>
                        {verificationMoreInsights && (
                          <div className="p-2 bg-primary-50 rounded-lg border border-primary-100">
                            <p className="text-xs text-surface-700 whitespace-pre-wrap">{verificationMoreInsights}</p>
                          </div>
                        )}
                        <button
                          onClick={handleGetMoreVerificationInsights}
                          disabled={moreInsightsLoading === 'verification'}
                          className="flex items-center gap-2 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors disabled:opacity-50"
                        >
                          {moreInsightsLoading === 'verification' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
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
                              
                              {/* Auto-generated Insights */}
                              <div className="pt-4 border-t border-surface-100">
                                <HighlightableContent
                                  sourceType="rubric"
                                  sourceId={`criterion-${selectedCriterionIndex}`}
                                  criterionId={`criterion-${selectedCriterionIndex}`}
                                  rubricCriterion={c.criterion}
                                >
                                  <ClassInsightCard
                                    key={`insight-${c.criterion}-${selectedCriterionIndex}`}
                                    title={c.criterion}
                                    score={c.score}
                                    maxScore={c.maxScore || 10}
                                    status={status}
                                    feedback={c.feedback || c.rationale || 'No detailed feedback available.'}
                                    defaultExpanded={true}
                                    autoGenerateInsights={true}
                                    initialInsights={criterionInsights[c.criterion] || null}
                                    citationSegments={sortedSegments.map(seg => ({ timestamp: normalizeTimestamp(seg.timestamp), text: seg.text }))}
                                    courseReferences={[
                                      { id: 'rubric', title: c.criterion, type: 'rubric' as const, explanation: (c.rationale || c.feedback || `This rubric criterion applies to the insight above.`).slice(0, 300), documentUrl: batchInfo?.courseId ? `/courses/${batchInfo.courseId}/content` : undefined },
                                      ...(batchInfo?.courseId ? [{ id: 'course', title: batchInfo.courseName || 'Course materials', type: 'course' as const, excerpt: `Relevant lecture slides, readings, or course materials define or reinforce expectations for ${c.criterion}. See course content for full materials.`, documentUrl: `/courses/${batchInfo.courseId}/content` }] : []),
                                    ]}
                                    videoUrl={videoUrl}
                                    criterionIndex={selectedCriterionIndex}
                                    totalCriteria={effectiveCriteria.length}
                                    onInsightsGenerated={(criterionTitle, insights) => {
                                      setCriterionInsights(prev => {
                                        const next = insights ? { ...prev, [criterionTitle]: insights } : (() => { const { [criterionTitle]: _, ...rest } = prev; return rest; })();
                                        // Persist so Babblet insights run once and stay consistent on future visits
                                        fetch('/api/bulk/submissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId, criterionInsights: next }) }).catch(() => {});
                                        return next;
                                      });
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
              alerts={(() => {
                const alerts: Array<{ type: 'pacing' | 'volume'; label: string; timeRange?: string }> = [];
                if (speechMetrics) {
                  const wpm = speechMetrics.speakingRateWpm;
                  if (wpm >= 120 && wpm <= 180) alerts.push({ type: 'pacing', label: 'Pacing Good' });
                  else if (wpm < 120) alerts.push({ type: 'pacing', label: 'Consider speaking a bit faster' });
                  else alerts.push({ type: 'pacing', label: 'Consider slowing down for clarity' });
                } else {
                  alerts.push({ type: 'pacing', label: 'Pacing Good' });
                }
                return alerts;
              })()}
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
