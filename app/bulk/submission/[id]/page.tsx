'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, Lightbulb,
  MessageCircleQuestion, FileText, BarChart3, Clock, Loader2, Download,
  RefreshCw, X, ChevronRight, Play
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import RubricDetailDrawer from '@/components/RubricDetailDrawer';
import TranscriptViewer from '@/components/TranscriptViewer';

// ============================================
// Types
// ============================================

// Enhanced types with deep linking support
interface TranscriptRef {
  segmentId: string;
  timestamp: number;
  snippet: string;
}

interface StrengthOrImprovement {
  text: string;
  criterionId?: string;
  criterionName?: string;
  transcriptRefs?: TranscriptRef[];
}

interface CriterionBreakdown {
  criterionId?: string;
  criterion: string;
  score: number;
  maxScore?: number; // Maximum for this criterion (from rubric)
  feedback: string;
  rationale?: string;
  transcriptRefs?: TranscriptRef[];
  strengths?: StrengthOrImprovement[];
  improvements?: StrengthOrImprovement[];
  citations?: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
    relevanceScore?: number;
  }>;
}

interface Submission {
  id: string;
  batchId: string;
  originalFilename: string;
  studentName: string;
  status: string;
  errorMessage?: string;
  // File access
  fileKey?: string;
  // Context reference
  bundleVersionId?: string;
  contextCitations?: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  retrievalMetrics?: {
    chunksRetrieved: number;
    averageRelevance: number;
    highConfidenceCount: number;
    usedFallback: boolean;
    contextCharsUsed: number;
  };
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
    // Grading scale metadata
    gradingScaleUsed?: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
    maxPossibleScore?: number;
    letterGrade?: string;
    bandLabel?: string;
    criteriaBreakdown?: CriterionBreakdown[];
    // Strengths/improvements can be strings (legacy) or objects (new)
    strengths: Array<string | StrengthOrImprovement>;
    improvements: Array<string | StrengthOrImprovement>;
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

// Format score based on grading scale type
function formatScore(rubricEval: {
  overallScore: number;
  gradingScaleUsed?: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
  maxPossibleScore?: number;
  letterGrade?: string;
  bandLabel?: string;
}): string {
  const { overallScore, gradingScaleUsed, maxPossibleScore, letterGrade, bandLabel } = rubricEval;
  
  switch (gradingScaleUsed) {
    case 'points':
      // Show as "82 / 100" or similar
      return `${overallScore.toFixed(0)} / ${maxPossibleScore || 100}`;
    
    case 'percentage':
      // Show as "82%"
      return `${overallScore.toFixed(1)}%`;
    
    case 'letter':
      // Show letter grade with numeric: "A (92)"
      if (letterGrade) {
        return `${letterGrade} (${overallScore.toFixed(0)})`;
      }
      return `${overallScore.toFixed(0)} / 100`;
    
    case 'bands':
      // Show band label with numeric: "Excellent (92)"
      if (bandLabel) {
        return `${bandLabel} (${overallScore.toFixed(0)})`;
      }
      return `${overallScore.toFixed(0)} / 100`;
    
    default:
      // Fallback: normalized 0-100 or legacy 1-5
      if (overallScore <= 5) {
        return `${overallScore.toFixed(1)} / 5`;
      }
      return `${overallScore.toFixed(0)} / 100`;
  }
}

// Format criterion score based on max
function formatCriterionScore(score: number, maxScore?: number): string {
  if (maxScore) {
    return `${score.toFixed(1)} / ${maxScore}`;
  }
  if (score <= 5) {
    return `${score.toFixed(1)} / 5`;
  }
  return `${score.toFixed(0)} / 100`;
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
  const [contextInfo, setContextInfo] = useState<BundleVersionInfo | null>(null);

  // Re-grade state
  interface VersionOption { id: string; version: number; createdAt: number; criteriaCount: number; }
  const [showRegradeModal, setShowRegradeModal] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<VersionOption[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [regrading, setRegrading] = useState(false);

  // Rubric detail drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCriterion, setSelectedCriterion] = useState<CriterionBreakdown | undefined>(undefined);
  const [selectedItem, setSelectedItem] = useState<StrengthOrImprovement | undefined>(undefined);
  const [selectedItemType, setSelectedItemType] = useState<'strength' | 'improvement' | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Open drawer for a criterion
  const openCriterionDrawer = (criterion: CriterionBreakdown) => {
    setSelectedCriterion(criterion);
    setSelectedItem(undefined);
    setSelectedItemType(undefined);
    setDrawerOpen(true);
  };

  // Open drawer for a strength/improvement
  const openItemDrawer = (item: string | StrengthOrImprovement, type: 'strength' | 'improvement') => {
    const itemObj = typeof item === 'string' ? { text: item } : item;
    // Find the related criterion if available
    let criterion: CriterionBreakdown | undefined;
    if (itemObj.criterionId && submission?.rubricEvaluation?.criteriaBreakdown) {
      criterion = submission.rubricEvaluation.criteriaBreakdown.find(
        c => c.criterionId === itemObj.criterionId
      );
    }
    setSelectedCriterion(criterion);
    setSelectedItem(itemObj);
    setSelectedItemType(type);
    setDrawerOpen(true);
  };

  // Get video URL for the submission
  useEffect(() => {
    if (submission?.fileKey) {
      // Fetch presigned URL for the video
      fetch(`/api/bulk/presign?key=${encodeURIComponent(submission.fileKey)}&action=download`)
        .then(res => res.json())
        .then(data => {
          if (data.url) setVideoUrl(data.url);
        })
        .catch(err => console.error('Failed to get video URL:', err));
    }
  }, [submission?.fileKey]);

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

  // Load available versions for re-grade
  const loadVersions = async (bundleId: string) => {
    try {
      const res = await fetch(`/api/bulk/regrade?bundleId=${bundleId}`);
      const data = await res.json();
      if (data.success) {
        setAvailableVersions(data.versions || []);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  };

  const handleRegrade = async () => {
    if (!selectedVersion || !submission) return;
    
    try {
      setRegrading(true);
      const res = await fetch('/api/bulk/regrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          bundleVersionId: selectedVersion,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowRegradeModal(false);
        // Trigger processing
        await fetch(`/api/bulk/process-now?batchId=${submission.batchId}`, { method: 'POST' });
        // Reload submission
        loadSubmission();
        alert('Re-grade started. The submission will be re-analyzed with the new context.');
      }
    } catch (error) {
      console.error('Re-grade failed:', error);
    } finally {
      setRegrading(false);
    }
  };

  const openRegradeModal = async () => {
    // Get bundle ID from context info (we need to fetch it)
    if (submission?.bundleVersionId) {
      try {
        const res = await fetch(`/api/context/bundles?versionId=${submission.bundleVersionId}`);
        const data = await res.json();
        if (data.success && data.context) {
          // The bundle ID is in the version, we need to get versions for this bundle
          const bundleRes = await fetch(`/api/context/bundles?versionId=${submission.bundleVersionId}`);
          const bundleData = await bundleRes.json();
          // For now, let's get versions from the batch
        }
      } catch (e) {
        console.log('Could not load bundle info:', e);
      }
    }
    setShowRegradeModal(true);
  };

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
              {/* Student Report Link */}
              <Link
                href={`/report/${submission.id}`}
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 bg-emerald-100 rounded-lg hover:bg-emerald-200"
              >
                <FileText className="w-4 h-4" />
                Student Report
              </Link>
              
              {submission.bundleVersionId && (
                <button
                  onClick={openRegradeModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-600 bg-violet-100 rounded-lg hover:bg-violet-200"
                >
                  <RefreshCw className="w-4 h-4" />
                  Re-grade
                </button>
              )}
              {submission.rubricEvaluation && (
                <div className={`px-4 py-2 rounded-lg ${getScoreBg(submission.rubricEvaluation.overallScore)}`}>
                  <span className="text-sm text-surface-600">Score:</span>
                  <span className={`ml-2 text-xl font-bold ${getScoreColor(submission.rubricEvaluation.overallScore)}`}>
                    {formatScore(submission.rubricEvaluation)}
                  </span>
                  {submission.rubricEvaluation.gradingScaleUsed && submission.rubricEvaluation.gradingScaleUsed !== 'none' && (
                    <span className="ml-2 text-xs text-surface-500 bg-surface-100 px-2 py-0.5 rounded">
                      {submission.rubricEvaluation.gradingScaleUsed === 'points' ? 'Rubric Scale' :
                       submission.rubricEvaluation.gradingScaleUsed === 'letter' ? 'Letter Grade' :
                       submission.rubricEvaluation.gradingScaleUsed === 'bands' ? 'Performance Band' :
                       'Percentage'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'transcript', 'questions', 'rubric'] as const).map(tab => (
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
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="space-y-6 lg:col-span-2">
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
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
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
            </div>

            {/* Video Player */}
            <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Play className="w-5 h-5 text-primary-500" />
                <h3 className="font-semibold text-surface-900">Video</h3>
              </div>
              {videoUrl ? (
                <video
                  controls
                  src={videoUrl}
                  className="w-full rounded-lg bg-black"
                />
              ) : (
                <div className="flex items-center justify-center h-48 bg-surface-50 rounded-lg text-sm text-surface-500">
                  Video not available
                </div>
              )}
              {submission.originalFilename && (
                <p className="mt-3 text-xs text-surface-500 truncate">
                  {submission.originalFilename}
                </p>
              )}
            </div>
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

            {/* Context Citations */}
            {(submission.contextCitations && submission.contextCitations.length > 0) || submission.retrievalMetrics ? (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-3">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-violet-500" />
                  <h3 className="font-semibold text-surface-900">Context Used for Grading</h3>
                  {contextInfo && (
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full ml-2">
                      v{contextInfo.version}
                    </span>
                  )}
                </div>
                
                {/* Retrieval Quality Metrics */}
                {submission.retrievalMetrics && (
                  <div className="mb-4 p-3 bg-surface-50 rounded-lg">
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-surface-500">Chunks:</span>
                        <span className="font-medium text-surface-700">
                          {submission.retrievalMetrics.chunksRetrieved}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-surface-500">Avg Relevance:</span>
                        <span className={`font-medium ${
                          submission.retrievalMetrics.averageRelevance >= 0.5 
                            ? 'text-emerald-600' 
                            : submission.retrievalMetrics.averageRelevance >= 0.25 
                              ? 'text-amber-600' 
                              : 'text-red-500'
                        }`}>
                          {(submission.retrievalMetrics.averageRelevance * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-surface-500">High Confidence:</span>
                        <span className="font-medium text-emerald-600">
                          {submission.retrievalMetrics.highConfidenceCount}
                        </span>
                      </div>
                      {submission.retrievalMetrics.usedFallback && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                          Used Course Summary Fallback
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                <p className="text-sm text-surface-500 mb-4">
                  These course materials were retrieved and used by Babblet during evaluation.
                </p>
                
                {submission.contextCitations && submission.contextCitations.length > 0 ? (
                  <div className="space-y-3">
                    {submission.contextCitations.map((citation, idx) => (
                      <div 
                        key={citation.chunkId} 
                        className="p-4 bg-violet-50 rounded-lg border border-violet-200"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 bg-violet-200 text-violet-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-violet-900">{citation.documentName}</p>
                              {citation.relevanceScore && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  citation.relevanceScore >= 0.5 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : citation.relevanceScore >= 0.25 
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-surface-100 text-surface-600'
                                }`}>
                                  {(citation.relevanceScore * 100).toFixed(0)}% match
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-surface-600 mt-1 italic">&quot;{citation.snippet}&quot;</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-surface-400 italic">
                    No specific document excerpts were retrieved. Course summary was used for context.
                  </p>
                )}
              </div>
            ) : null}
          </motion.div>
        )}

        {/* Rubric Tab */}
        {activeTab === 'rubric' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Rubric Evaluation */}
            {submission.rubricEvaluation ? (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  <h3 className="font-semibold text-surface-900">Rubric Evaluation</h3>
                </div>

                {/* Criteria Breakdown - Clickable */}
                {submission.rubricEvaluation.criteriaBreakdown && (
                  <div className="space-y-3 mb-6">
                    {submission.rubricEvaluation.criteriaBreakdown.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => openCriterionDrawer(c)}
                        className="w-full p-3 bg-surface-50 rounded-lg hover:bg-surface-100 hover:shadow-sm transition-all text-left group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-surface-900 group-hover:text-primary-700 flex items-center gap-1">
                            {c.criterion}
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                          <span className={`font-bold ${getScoreColor(c.score)}`}>
                            {formatCriterionScore(c.score, c.maxScore)}
                          </span>
                        </div>
                        <p className="text-sm text-surface-600 line-clamp-2">{c.feedback}</p>
                        {c.rationale && (
                          <p className="text-xs text-surface-500 mt-2 italic line-clamp-3">
                            {c.rationale}
                          </p>
                        )}

                        {/* Transcript link indicator */}
                        {c.transcriptRefs && c.transcriptRefs.length > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-primary-600">
                            <Play className="w-3 h-3" />
                            {c.transcriptRefs.length} transcript moment{c.transcriptRefs.length !== 1 ? 's' : ''}
                          </div>
                        )}

                        {/* Criterion-level citations */}
                        {c.citations && c.citations.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-surface-200">
                            <p className="text-xs text-violet-600 mb-1">📚 Context highlights:</p>
                            {c.citations.slice(0, 2).map((cite, cIdx) => (
                              <p key={cIdx} className="text-xs text-surface-500 truncate">
                                {cite.documentName}
                              </p>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Strengths - Clickable */}
                {submission.rubricEvaluation.strengths.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-emerald-700 mb-2">Strengths</h4>
                    <ul className="space-y-1">
                      {submission.rubricEvaluation.strengths.map((s, i) => {
                        const text = typeof s === 'string' ? s : s.text;
                        const hasRefs = typeof s !== 'string' && s.transcriptRefs && s.transcriptRefs.length > 0;
                        const criterionName = typeof s !== 'string' ? s.criterionName : undefined;
                        return (
                          <li key={i}>
                            <button
                              onClick={() => openItemDrawer(s, 'strength')}
                              className="flex items-start gap-2 text-sm text-surface-700 w-full text-left p-2 -m-2 rounded-lg hover:bg-emerald-50 transition-colors group"
                            >
                              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <span className="group-hover:text-emerald-700">{text}</span>
                                {(hasRefs || criterionName) && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {criterionName && (
                                      <span className="text-xs text-surface-400">From: {criterionName}</span>
                                    )}
                                    {hasRefs && (
                                      <span className="text-xs text-primary-500 flex items-center gap-0.5">
                                        <Play className="w-3 h-3" /> See in video
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Improvements - Clickable */}
                {submission.rubricEvaluation.improvements.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-amber-700 mb-2">Areas for Improvement</h4>
                    <ul className="space-y-1">
                      {submission.rubricEvaluation.improvements.map((s, i) => {
                        const text = typeof s === 'string' ? s : s.text;
                        const hasRefs = typeof s !== 'string' && s.transcriptRefs && s.transcriptRefs.length > 0;
                        const criterionName = typeof s !== 'string' ? s.criterionName : undefined;
                        return (
                          <li key={i}>
                            <button
                              onClick={() => openItemDrawer(s, 'improvement')}
                              className="flex items-start gap-2 text-sm text-surface-700 w-full text-left p-2 -m-2 rounded-lg hover:bg-amber-50 transition-colors group"
                            >
                              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <span className="group-hover:text-amber-700">{text}</span>
                                {(hasRefs || criterionName) && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {criterionName && (
                                      <span className="text-xs text-surface-400">From: {criterionName}</span>
                                    )}
                                    {hasRefs && (
                                      <span className="text-xs text-primary-500 flex items-center gap-0.5">
                                        <Play className="w-3 h-3" /> See in video
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-2">
                <p className="text-surface-500">No rubric evaluation available.</p>
              </div>
            )}

            {/* Rubric Highlights Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-surface-900">Rubric Highlights</h3>
              </div>
              <p className="text-sm text-surface-600 mb-4">
                Claude highlights criteria using the class context, assignment context, and accuracy checks.
              </p>
              <div className="space-y-2 text-sm text-surface-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Strengths and improvements are tied to rubric criteria.</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-500" />
                  <span>Context citations show where rubric alignment came from.</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Fact verification influences rubric decisions.</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Transcript Tab - Using shared TranscriptViewer */}
        {activeTab === 'transcript' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-surface-500" />
              <h3 className="font-semibold text-surface-900">Transcript</h3>
              {submission.transcriptSegments && (
                <span className="text-xs text-surface-400">
                  {submission.transcriptSegments.length} segments
                </span>
              )}
            </div>

            {submission.transcriptSegments && submission.transcriptSegments.length > 0 ? (
              <TranscriptViewer
                segments={submission.transcriptSegments}
                onSegmentClick={(seg) => {
                  // Could open video at this timestamp
                  if (videoUrl) {
                    // TODO: Open mini player modal
                    console.log('Clicked segment:', seg.id, 'at', seg.timestamp);
                  }
                }}
                className="max-h-[600px]"
              />
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

      {/* Re-grade Modal */}
      {showRegradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-surface-900">Re-grade with Different Context</h3>
              <button
                onClick={() => setShowRegradeModal(false)}
                className="p-1 text-surface-400 hover:text-surface-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-surface-600 mb-4">
              Re-grade this submission using a different context snapshot. The submission will be re-analyzed with the selected rubric and materials.
            </p>

            {availableVersions.length > 0 ? (
              <div className="space-y-3 mb-6">
                {availableVersions.map(v => (
                  <label
                    key={v.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      selectedVersion === v.id
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-surface-200 hover:border-surface-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="version"
                      value={v.id}
                      checked={selectedVersion === v.id}
                      onChange={(e) => setSelectedVersion(e.target.value)}
                      className="text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <p className="font-medium text-surface-900">Context v{v.version}</p>
                      <p className="text-xs text-surface-500">
                        {v.criteriaCount} criteria • {new Date(v.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-surface-500 text-sm">
                <p>No alternative versions available.</p>
                <p className="mt-1">Create a new snapshot in the Course Notebook to re-grade.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRegradeModal(false)}
                className="px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRegrade}
                disabled={!selectedVersion || regrading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {regrading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Start Re-grade
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rubric Detail Drawer - Deep linking between rubric, transcript, and video */}
      <RubricDetailDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCriterion(undefined);
          setSelectedItem(undefined);
          setSelectedItemType(undefined);
        }}
        criterion={selectedCriterion}
        item={selectedItem}
        itemType={selectedItemType}
        transcript={submission.transcript}
        transcriptSegments={submission.transcriptSegments}
        videoUrl={videoUrl || undefined}
      />
    </div>
  );
}

