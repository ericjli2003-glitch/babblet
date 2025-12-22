'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, Lightbulb,
  MessageCircleQuestion, FileText, BarChart3, Clock, Loader2, Download
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ============================================
// Types
// ============================================

interface Submission {
  id: string;
  batchId: string;
  originalFilename: string;
  studentName: string;
  status: string;
  errorMessage?: string;
  // Context reference
  bundleVersionId?: string;
  transcript?: string;
  transcriptSegments?: Array<{
    id: string;
    text: string;
    timestamp: number;
    speaker?: string;
  }>;
  analysis?: {
    keyClaims: Array<{ id: string; claim: string; evidence: string[] }>;
    logicalGaps: Array<{ id: string; description: string; severity: string }>;
    missingEvidence: Array<{ id: string; description: string }>;
    overallStrength: number;
  };
  rubricEvaluation?: {
    overallScore: number;
    criteriaBreakdown?: Array<{
      criterion: string;
      score: number;
      feedback: string;
    }>;
    strengths: string[];
    improvements: string[];
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  verificationFindings?: Array<{
    id: string;
    statement: string;
    status: string;
    explanation: string;
  }>;
  createdAt: number;
  completedAt?: number;
}

interface BundleVersionInfo {
  version: number;
  courseName?: string;
  assignmentName?: string;
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
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 3) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score >= 4) return 'bg-emerald-100';
  if (score >= 3) return 'bg-amber-100';
  return 'bg-red-100';
}

// ============================================
// Main Component
// ============================================

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'questions'>('overview');
  const [contextInfo, setContextInfo] = useState<BundleVersionInfo | null>(null);

  const loadSubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk/submissions?id=${submissionId}`);
      const data = await res.json();
      if (data.success) {
        setSubmission(data.submission);
        
        // Load context info if bundleVersionId exists
        if (data.submission.bundleVersionId) {
          try {
            const ctxRes = await fetch(`/api/context/bundles?versionId=${data.submission.bundleVersionId}`);
            const ctxData = await ctxRes.json();
            if (ctxData.success && ctxData.context) {
              setContextInfo({
                version: ctxData.context.bundleVersion,
                courseName: ctxData.context.assignment?.name,
                assignmentName: ctxData.context.rubric?.name,
              });
            }
          } catch (e) {
            console.log('Could not load context info:', e);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-surface-900">Submission not found</h2>
          <Link href="/bulk" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
            Back to Bulk Upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link 
                href={`/bulk`}
                className="flex items-center gap-2 text-surface-600 hover:text-surface-900"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm">Back to Batch</span>
              </Link>
              <div className="h-6 w-px bg-surface-200" />
              <div>
                <h1 className="text-xl font-bold text-surface-900">
                  {submission.studentName}
                </h1>
                {/* Context Indicator */}
                {contextInfo && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Graded with Context v{contextInfo.version}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {submission.rubricEvaluation && (
                <div className={`px-4 py-2 rounded-lg ${getScoreBg(submission.rubricEvaluation.overallScore)}`}>
                  <span className="text-sm text-surface-600">Score:</span>
                  <span className={`ml-2 text-xl font-bold ${getScoreColor(submission.rubricEvaluation.overallScore)}`}>
                    {submission.rubricEvaluation.overallScore.toFixed(1)}/5
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'transcript', 'questions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-surface-600 hover:bg-surface-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Rubric Evaluation */}
            {submission.rubricEvaluation && (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  <h3 className="font-semibold text-surface-900">Rubric Evaluation</h3>
                </div>

                {/* Criteria Breakdown */}
                {submission.rubricEvaluation.criteriaBreakdown && (
                  <div className="space-y-3 mb-6">
                    {submission.rubricEvaluation.criteriaBreakdown.map((c, i) => (
                      <div key={i} className="p-3 bg-surface-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-surface-900">{c.criterion}</span>
                          <span className={`font-bold ${getScoreColor(c.score)}`}>
                            {c.score.toFixed(1)}/5
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">{c.feedback}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Strengths */}
                {submission.rubricEvaluation.strengths.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-emerald-700 mb-2">Strengths</h4>
                    <ul className="space-y-1">
                      {submission.rubricEvaluation.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-700">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {submission.rubricEvaluation.improvements.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-amber-700 mb-2">Areas for Improvement</h4>
                    <ul className="space-y-1">
                      {submission.rubricEvaluation.improvements.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-700">
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Analysis */}
            {submission.analysis && (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  <h3 className="font-semibold text-surface-900">Analysis</h3>
                </div>

                {/* Overall Strength */}
                <div className="flex items-center gap-4 mb-6 p-4 bg-surface-50 rounded-lg">
                  <span className="text-sm text-surface-600">Argument Strength:</span>
                  <div className="flex-1 h-3 bg-surface-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-400 to-emerald-500"
                      style={{ width: `${(submission.analysis.overallStrength / 5) * 100}%` }}
                    />
                  </div>
                  <span className="font-bold text-surface-900">
                    {submission.analysis.overallStrength.toFixed(1)}/5
                  </span>
                </div>

                {/* Key Claims */}
                {submission.analysis.keyClaims.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-surface-700 mb-2">Key Claims</h4>
                    <ul className="space-y-2">
                      {submission.analysis.keyClaims.map(c => (
                        <li key={c.id} className="p-2 bg-emerald-50 rounded text-sm text-surface-700">
                          {c.claim}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Logical Gaps */}
                {submission.analysis.logicalGaps.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-amber-700 mb-2">Logical Gaps</h4>
                    <ul className="space-y-2">
                      {submission.analysis.logicalGaps.map(g => (
                        <li key={g.id} className="p-2 bg-amber-50 rounded text-sm text-surface-700">
                          <span className="text-xs font-medium text-amber-600 mr-2">[{g.severity}]</span>
                          {g.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Missing Evidence */}
                {submission.analysis.missingEvidence.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-700 mb-2">Missing Evidence</h4>
                    <ul className="space-y-2">
                      {submission.analysis.missingEvidence.map(e => (
                        <li key={e.id} className="p-2 bg-red-50 rounded text-sm text-surface-700">
                          {e.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Verification Findings */}
            {submission.verificationFindings && submission.verificationFindings.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-surface-900">Fact Verification</h3>
                </div>
                <div className="space-y-3">
                  {submission.verificationFindings.map(f => (
                    <div 
                      key={f.id} 
                      className={`p-3 rounded-lg ${
                        f.status === 'verified' ? 'bg-emerald-50' :
                        f.status === 'questionable' ? 'bg-amber-50' :
                        f.status === 'incorrect' ? 'bg-red-50' : 'bg-surface-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {f.status === 'verified' && <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />}
                        {f.status === 'questionable' && <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />}
                        {f.status === 'incorrect' && <XCircle className="w-4 h-4 text-red-500 mt-0.5" />}
                        <div>
                          <p className="text-sm font-medium text-surface-900">{f.statement}</p>
                          <p className="text-sm text-surface-600 mt-1">{f.explanation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Transcript Tab */}
        {activeTab === 'transcript' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-surface-500" />
              <h3 className="font-semibold text-surface-900">Transcript</h3>
            </div>

            {submission.transcriptSegments && submission.transcriptSegments.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {submission.transcriptSegments.map(seg => (
                  <div key={seg.id} className="flex gap-4">
                    <span className="text-xs text-surface-400 font-mono w-16 flex-shrink-0">
                      {formatTimestamp(seg.timestamp)}
                    </span>
                    {seg.speaker && (
                      <span className="text-xs font-medium text-primary-600 w-20 flex-shrink-0">
                        {seg.speaker}
                      </span>
                    )}
                    <p className="text-sm text-surface-700 flex-1">{seg.text}</p>
                  </div>
                ))}
              </div>
            ) : submission.transcript ? (
              <p className="text-sm text-surface-700 whitespace-pre-wrap">{submission.transcript}</p>
            ) : (
              <p className="text-surface-500">No transcript available</p>
            )}
          </motion.div>
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageCircleQuestion className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold text-surface-900">Follow-up Questions</h3>
            </div>

            {submission.questions && submission.questions.length > 0 ? (
              <div className="space-y-3">
                {submission.questions.map((q, i) => (
                  <div key={q.id} className="p-4 bg-violet-50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-violet-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
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
          </motion.div>
        )}

        {/* Meta info */}
        <div className="mt-6 text-center text-sm text-surface-500">
          <span>File: {submission.originalFilename}</span>
          <span className="mx-2">•</span>
          <span>Processed: {submission.completedAt ? formatDate(submission.completedAt) : 'In progress'}</span>
        </div>
      </main>
    </div>
  );
}

