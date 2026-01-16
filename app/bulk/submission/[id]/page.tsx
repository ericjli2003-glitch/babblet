'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, Lightbulb,
  MessageCircleQuestion, FileText, BarChart3, Clock, Loader2, Download,
  RefreshCw, X, ChevronRight, ChevronDown, Play, Volume2, Gauge,
  Edit3, Save, Upload
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

// ============================================
// Types
// ============================================

interface TranscriptRef {
  segmentId: string;
  timestamp: number;
  snippet: string;
}

interface CriterionBreakdown {
  criterionId?: string;
  criterion: string;
  score: number;
  maxScore?: number;
  feedback: string;
  rationale?: string;
  transcriptRefs?: TranscriptRef[];
}

interface Submission {
  id: string;
  batchId: string;
  originalFilename: string;
  studentName: string;
  status: string;
  errorMessage?: string;
  fileKey?: string;
  fileSize?: number;
  bundleVersionId?: string;
  transcript?: string;
  transcriptSegments?: Array<{
    id: string;
    text: string;
    timestamp: number;
    speaker?: string;
  }>;
  rubricEvaluation?: {
    overallScore: number;
    gradingScaleUsed?: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
    maxPossibleScore?: number;
    letterGrade?: string;
    bandLabel?: string;
    criteriaBreakdown?: CriterionBreakdown[];
    strengths: Array<string | { text: string }>;
    improvements: Array<string | { text: string }>;
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
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
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getLetterGrade(score: number, maxScore: number = 100): { letter: string; percentage: number } {
  const percentage = (score / maxScore) * 100;
  let letter = 'F';
  if (percentage >= 93) letter = 'A';
  else if (percentage >= 90) letter = 'A-';
  else if (percentage >= 87) letter = 'B+';
  else if (percentage >= 83) letter = 'B';
  else if (percentage >= 80) letter = 'B-';
  else if (percentage >= 77) letter = 'C+';
  else if (percentage >= 73) letter = 'C';
  else if (percentage >= 70) letter = 'C-';
  else if (percentage >= 67) letter = 'D+';
  else if (percentage >= 60) letter = 'D';
  return { letter, percentage };
}

// ============================================
// Main Component
// ============================================

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'questions' | 'rubric'>('rubric');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [expandedCriteria, setExpandedCriteria] = useState<Set<number>>(new Set([0]));
  const [additionalNotes, setAdditionalNotes] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Batch info for breadcrumb
  const [batchInfo, setBatchInfo] = useState<{ name: string; courseName?: string; assignmentName?: string } | null>(null);

  const loadSubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk/submissions?id=${submissionId}`);
      const data = await res.json();
      if (data.success) {
        setSubmission(data.submission);

        // Load batch info for breadcrumb
        if (data.submission.batchId) {
          try {
            const batchRes = await fetch(`/api/bulk/status?batchId=${data.submission.batchId}`);
            const batchData = await batchRes.json();
            if (batchData.success && batchData.batch) {
              setBatchInfo({
                name: batchData.batch.name,
                courseName: batchData.batch.courseName,
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

  // Get video URL
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

  const toggleCriterion = (index: number) => {
    setExpandedCriteria(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const seekToTimestamp = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp / 1000;
      videoRef.current.play();
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
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

  const rubric = submission.rubricEvaluation;
  const gradeInfo = rubric ? getLetterGrade(rubric.overallScore, rubric.maxPossibleScore || 100) : null;

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        {/* Top Header Bar */}
        <div className="bg-white border-b border-surface-200 px-6 py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-surface-500 mb-3">
            <Link href="/" className="hover:text-primary-600">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/bulk" className="hover:text-primary-600">Batches</Link>
            {batchInfo && (
              <>
                <ChevronRight className="w-4 h-4" />
                <Link href={`/bulk`} className="hover:text-primary-600">{batchInfo.name}</Link>
              </>
            )}
            <ChevronRight className="w-4 h-4" />
            <span className="text-surface-900 font-medium">{submission.studentName}</span>
          </nav>

          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-surface-900">{submission.studentName}</h1>
                {submission.status === 'ready' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Submitted on time
                  </span>
                )}
              </div>
              <p className="text-sm text-surface-500 mt-1">
                Submission: {batchInfo?.assignmentName || 'Assignment'} • {formatDate(submission.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/report/${submission.id}`}
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 text-sm"
              >
                <Download className="w-4 h-4" />
                Export Report
              </Link>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium">
                Final to Grade
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4">
            {(['overview', 'transcript', 'questions', 'rubric'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab
                  ? 'bg-surface-50 text-primary-600 border-b-2 border-primary-500'
                  : 'text-surface-500 hover:text-surface-700'
                  }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex-1 overflow-auto bg-surface-50">
          <div className="flex h-full">
            {/* Left Column - Rubric Details */}
            <div className="flex-1 p-6 overflow-auto">
              {activeTab === 'rubric' && rubric && (
                <div className="space-y-6 max-w-3xl">
                  {/* Grade Summary Card */}
                  <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Total Grade</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-surface-900">
                            {rubric.letterGrade || gradeInfo?.letter || 'B+'}
                          </span>
                          <span className="text-lg text-surface-500">
                            ({Math.round(gradeInfo?.percentage || rubric.overallScore)}%)
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="mt-3 w-48">
                          <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 transition-all"
                              style={{ width: `${gradeInfo?.percentage || rubric.overallScore}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Grading Status</p>
                        <div className="flex items-center gap-2 text-amber-600">
                          <Edit3 className="w-4 h-4" />
                          <span className="font-medium">Draft Saved</span>
                        </div>
                        <p className="text-xs text-surface-400 mt-1">Last edited just now</p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Rubric */}
                  <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h2 className="text-lg font-semibold text-surface-900 mb-4">Detailed Rubric</h2>

                    <div className="space-y-4">
                      {rubric.criteriaBreakdown?.map((criterion, index) => {
                        const isExpanded = expandedCriteria.has(index);
                        const maxScore = criterion.maxScore || 5;
                        const scorePercentage = (criterion.score / maxScore) * 100;

                        return (
                          <div key={index} className="border border-surface-200 rounded-lg overflow-hidden">
                            {/* Criterion Header */}
                            <button
                              onClick={() => toggleCriterion(index)}
                              className="w-full px-4 py-3 flex items-center justify-between bg-surface-50 hover:bg-surface-100 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                                  {index + 1}
                                </span>
                                <span className="font-medium text-surface-900">{criterion.criterion}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-primary-600">
                                  {criterion.score.toFixed(1)} / {maxScore}
                                </span>
                                <ChevronDown className={`w-5 h-5 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>

                            {/* Criterion Details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-4 space-y-4">
                                    {/* Score Bar */}
                                    <div>
                                      <div className="flex justify-between text-xs text-surface-500 mb-1">
                                        <span>Poor</span>
                                        <span>Average</span>
                                        <span>Excellent</span>
                                      </div>
                                      <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400 transition-all"
                                          style={{ width: `${scorePercentage}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Rationale */}
                                    <div>
                                      <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Rationale</p>
                                      <p className="text-sm text-surface-700">
                                        {criterion.rationale || criterion.feedback}
                                      </p>
                                    </div>

                                    {/* Feedback */}
                                    {criterion.feedback && criterion.rationale && (
                                      <div>
                                        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Feedback</p>
                                        <p className="text-sm text-surface-700">{criterion.feedback}</p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h2 className="text-lg font-semibold text-surface-900 mb-4">Additional Notes</h2>
                    <textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="Any final comments for this student?"
                      className="w-full h-24 px-3 py-2 border border-surface-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              )}

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6 max-w-3xl">
                  {rubric && (
                    <>
                      {/* Strengths */}
                      {rubric.strengths.length > 0 && (
                        <div className="bg-white rounded-xl border border-surface-200 p-6">
                          <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            Strengths
                          </h3>
                          <ul className="space-y-2">
                            {rubric.strengths.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-surface-700">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                                {typeof s === 'string' ? s : s.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Improvements */}
                      {rubric.improvements.length > 0 && (
                        <div className="bg-white rounded-xl border border-surface-200 p-6">
                          <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            Areas for Improvement
                          </h3>
                          <ul className="space-y-2">
                            {rubric.improvements.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-surface-700">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                                {typeof s === 'string' ? s : s.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <div className="bg-white rounded-xl border border-surface-200 p-6 max-w-3xl">
                  <h3 className="font-semibold text-surface-900 mb-4">Full Transcript</h3>
                  {submission.transcriptSegments && submission.transcriptSegments.length > 0 ? (
                    <div className="space-y-3 max-h-[600px] overflow-auto">
                      {submission.transcriptSegments.map((seg) => (
                        <div
                          key={seg.id}
                          className="flex gap-3 p-2 rounded-lg hover:bg-surface-50 cursor-pointer"
                          onClick={() => seekToTimestamp(seg.timestamp)}
                        >
                          <span className="text-xs text-primary-600 font-mono w-12 flex-shrink-0">
                            {formatTimestamp(seg.timestamp)}
                          </span>
                          <p className="text-sm text-surface-700">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : submission.transcript ? (
                    <p className="text-sm text-surface-700 whitespace-pre-wrap">{submission.transcript}</p>
                  ) : (
                    <p className="text-surface-500">No transcript available</p>
                  )}
                </div>
              )}

              {/* Questions Tab */}
              {activeTab === 'questions' && (
                <div className="bg-white rounded-xl border border-surface-200 p-6 max-w-3xl">
                  <h3 className="font-semibold text-surface-900 mb-4">Follow-up Questions</h3>
                  {submission.questions && submission.questions.length > 0 ? (
                    <div className="space-y-3">
                      {submission.questions.map((q, i) => (
                        <div key={q.id} className="p-4 bg-violet-50 rounded-lg">
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 bg-violet-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {i + 1}
                            </span>
                            <div>
                              <p className="text-surface-900">{q.question}</p>
                              <span className="text-xs text-violet-600 mt-1 inline-block">{q.category}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-surface-500">No questions generated</p>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Video & Transcript */}
            <div className="w-96 bg-surface-800 text-white flex flex-col">
              {/* Video Player */}
              <div className="p-4">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    controls
                    src={videoUrl}
                    className="w-full rounded-lg bg-black aspect-video"
                    poster=""
                  />
                ) : (
                  <div className="w-full aspect-video bg-surface-700 rounded-lg flex items-center justify-center">
                    <Play className="w-12 h-12 text-surface-500" />
                  </div>
                )}

                {/* File Info */}
                <div className="mt-3">
                  <p className="font-medium text-sm truncate">{submission.originalFilename}</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Uploaded {formatDate(submission.createdAt)} • {formatFileSize(submission.fileSize || 0)}
                  </p>
                </div>

                {/* Alert Badges */}
                <div className="flex gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded-full">
                    <Gauge className="w-3 h-3" />
                    Pacing Alert
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">
                    <Volume2 className="w-3 h-3" />
                    Low Volume 03:43-04:10
                  </span>
                </div>
              </div>

              {/* Live Transcript */}
              <div className="flex-1 border-t border-surface-700 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">LIVE TRANSCRIPT</h3>
                  <button className="text-xs text-primary-400 hover:text-primary-300">View Full</button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
                  {submission.transcriptSegments?.slice(0, 10).map((seg) => (
                    <div
                      key={seg.id}
                      className="cursor-pointer hover:bg-surface-700/50 rounded p-2 -m-2"
                      onClick={() => seekToTimestamp(seg.timestamp)}
                    >
                      <span className="text-primary-400 font-mono text-xs">
                        {formatTimestamp(seg.timestamp)}
                      </span>
                      <p className="text-surface-300 mt-0.5 text-xs leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                  {(!submission.transcriptSegments || submission.transcriptSegments.length === 0) && (
                    <p className="text-surface-500 text-xs">No transcript available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
