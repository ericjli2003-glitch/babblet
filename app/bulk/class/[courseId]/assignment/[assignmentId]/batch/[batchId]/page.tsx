'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Download, RefreshCw, ChevronLeft, ChevronRight, Filter,
  Loader2, AlertTriangle, TrendingUp, Clock, Flag, Eye,
  Play, AlertCircle, CheckCircle, ArrowLeft, Trash2, MoreVertical, Upload
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

// ============================================
// Types
// ============================================

interface Submission {
  id: string;
  studentName: string;
  originalFilename: string;
  status: 'queued' | 'uploading' | 'transcribing' | 'analyzing' | 'ready' | 'failed';
  createdAt: number;
  completedAt?: number;
  overallScore?: number;
  aiSentiment?: 'Confident' | 'Moderate' | 'Engaging' | 'Script Reading?' | 'Uncertain';
  videoLength?: string;
  flagged?: boolean;
  flagReason?: string;
}

interface BatchInfo {
  id: string;
  name: string;
  courseName?: string;
  courseCode?: string;
  term?: string;
  totalSubmissions: number;
  processedCount: number;
  failedCount: number;
  averageScore?: number;
  status: string;
}

// ============================================
// Helper Functions
// ============================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `Submitted ${days}d ago`;
  if (hours > 0) return `Submitted ${hours}h ago`;
  return 'Just submitted';
}

function getSentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case 'Confident': return 'text-emerald-600';
    case 'Engaging': return 'text-emerald-600';
    case 'Moderate': return 'text-surface-600';
    case 'Script Reading?': return 'text-amber-600';
    case 'Uncertain': return 'text-red-600';
    default: return 'text-surface-400';
  }
}

function getSentimentIcon(sentiment?: string) {
  switch (sentiment) {
    case 'Confident':
    case 'Engaging':
      return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'Script Reading?':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'Uncertain':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-surface-300" />;
  }
}

// ============================================
// Main Component
// ============================================

export default function AssignmentDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const assignmentId = params.assignmentId as string;
  const batchId = params.batchId as string;
  
  // Check if files are still uploading (passed from wizard)
  const expectedUploads = parseInt(searchParams.get('uploading') || '0', 10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isRegrading, setIsRegrading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Load batch and submissions
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Fetch batch status and course info
        const [batchRes, courseRes] = await Promise.all([
          fetch(`/api/bulk/status?batchId=${batchId}`),
          fetch(`/api/context/courses?id=${courseId}`),
        ]);
        
        const batchData = await batchRes.json();
        const courseData = await courseRes.json();
        
        if (!batchData.batch) {
          setError('Batch not found');
          return;
        }

        const course = courseData.course || {};
        
        setBatch({
          id: batchData.batch.id,
          name: batchData.batch.name,
          courseName: course.name || batchData.batch.courseName,
          courseCode: course.courseCode,
          term: course.term,
          totalSubmissions: batchData.batch.totalSubmissions || 0,
          processedCount: batchData.batch.processedCount || 0,
          failedCount: batchData.batch.failedCount || 0,
          averageScore: batchData.batch.averageScore,
          status: batchData.batch.status,
        });

        // Map submissions
        const subs: Submission[] = (batchData.submissions || []).map((sub: any) => ({
            id: sub.id,
          studentName: sub.studentName || 'Unknown Student',
          originalFilename: sub.originalFilename || 'Unknown',
          status: sub.status,
          createdAt: sub.createdAt || Date.now(),
            completedAt: sub.completedAt,
            overallScore: sub.rubricEvaluation?.overallScore,
          videoLength: sub.duration ? formatDuration(sub.duration) : undefined,
          aiSentiment: sub.analysis?.sentiment || (sub.status === 'ready' ? 'Confident' : undefined),
          flagged: sub.flagged,
          flagReason: sub.flagReason,
          }));

        setSubmissions(subs);
      } catch (err) {
        console.error('[AssignmentDashboard] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [batchId, courseId]);

  // Start grading handler - manually triggered by user
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [gradingStarted, setGradingStarted] = useState(false);

  const handleStartGrading = async () => {
    const queuedCount = submissions.filter(s => s.status === 'queued').length;
    if (queuedCount === 0) return;

    setIsStartingGrading(true);
    console.log(`[AssignmentDashboard] Starting grading for ${queuedCount} submissions`);

    try {
      // Fire multiple parallel requests to process submissions concurrently
      const numWorkers = Math.min(queuedCount, 3);
      const processingPromises = Array.from({ length: numWorkers }, () =>
        fetch(`/api/bulk/process-now?batchId=${batchId}`, { method: 'POST' })
          .catch(err => console.error('[AssignmentDashboard] Process trigger error:', err))
      );

      await Promise.all(processingPromises);
      console.log(`[AssignmentDashboard] Triggered ${numWorkers} processing workers`);
      setGradingStarted(true);
    } catch (err) {
      console.error('[AssignmentDashboard] Failed to start grading:', err);
    } finally {
      setIsStartingGrading(false);
    }
  };

  // Check if grading is in progress (for UI state)
  const hasQueuedSubmissions = submissions.some(s => s.status === 'queued');
  const hasActiveProcessing = submissions.some(s => 
    ['transcribing', 'analyzing'].includes(s.status)
  );
  const allProcessed = submissions.length > 0 && submissions.every(s => 
    s.status === 'ready' || s.status === 'failed'
  );

  // Reset gradingStarted if all submissions are processed
  useEffect(() => {
    if (allProcessed && gradingStarted) {
      setGradingStarted(false);
    }
  }, [allProcessed, gradingStarted]);

  // Show Start Grading button if there are queued submissions and nothing actively processing
  const showStartGrading = hasQueuedSubmissions && !hasActiveProcessing;
  
  // Show Grading in Progress only if actively processing
  const showGradingInProgress = hasActiveProcessing;

  // Calculate if uploads are still in progress
  const uploadsInProgress = expectedUploads > 0 && submissions.length < expectedUploads;
  const uploadProgress = expectedUploads > 0 ? Math.round((submissions.length / expectedUploads) * 100) : 100;

  // Poll for updates (also poll when waiting for uploads)
  useEffect(() => {
    if (!batchId) return;

    const hasActiveWork = submissions.some(s => 
      ['queued', 'uploading', 'transcribing', 'analyzing'].includes(s.status)
    );

    // Keep polling if uploads are expected or there's active work
    if (!hasActiveWork && !uploadsInProgress && submissions.length > 0) return;

    // Poll faster when uploads are in progress
    const pollInterval = uploadsInProgress ? 1500 : 3000;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
        const data = await res.json();

        if (data.submissions) {
          // When uploads are in progress, add new submissions to the list
          if (uploadsInProgress) {
            const newSubs: Submission[] = data.submissions
              .filter((s: any) => !submissions.find(existing => existing.id === s.id))
              .map((sub: any) => ({
                id: sub.id,
                studentName: sub.studentName || 'Unknown Student',
                originalFilename: sub.originalFilename || 'Unknown',
                status: sub.status,
                createdAt: sub.createdAt || Date.now(),
                completedAt: sub.completedAt,
                overallScore: sub.rubricEvaluation?.overallScore,
                aiSentiment: sub.analysis?.sentiment,
              }));
            
            if (newSubs.length > 0) {
              setSubmissions(prev => [...prev, ...newSubs]);
            }
          }
          
          // Update existing submissions
          setSubmissions(prev => prev.map(sub => {
            const updated = data.submissions.find((s: any) => s.id === sub.id);
            if (!updated) return sub;

            return {
              ...sub,
              status: updated.status,
              overallScore: updated.rubricEvaluation?.overallScore,
              completedAt: updated.completedAt,
              aiSentiment: updated.analysis?.sentiment || (updated.status === 'ready' ? 'Confident' : undefined),
            };
          }));
          
          if (data.batch) {
            setBatch(prev => prev ? {
              ...prev,
              processedCount: data.batch.processedCount || 0,
              failedCount: data.batch.failedCount || 0,
              averageScore: data.batch.averageScore,
            } : null);
          }
        }
      } catch (err) {
        console.error('[AssignmentDashboard] Poll error:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [batchId, submissions, uploadsInProgress, expectedUploads]);

  // Derived stats
  const stats = useMemo(() => {
    const pending = submissions.filter(s => 
      ['queued', 'transcribing', 'analyzing'].includes(s.status)
    ).length;
    const flagged = submissions.filter(s => s.flagged).length;
    const scores = submissions
      .filter(s => s.overallScore !== undefined)
      .map(s => s.overallScore!);
    const avgScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : undefined;
    
    return { pending, flagged, avgScore };
  }, [submissions]);

  // Pagination
  const totalPages = Math.ceil(submissions.length / itemsPerPage);
  const paginatedSubmissions = submissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleRegrade = async () => {
    setIsRegrading(true);
    try {
      await fetch(`/api/bulk/regrade?batchId=${batchId}`, { method: 'POST' });
      // Refetch data
      const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
      const data = await res.json();
      if (data.submissions) {
        setSubmissions(data.submissions.map((sub: any) => ({
          id: sub.id,
          studentName: sub.studentName || 'Unknown Student',
          originalFilename: sub.originalFilename || 'Unknown',
          status: sub.status,
          createdAt: sub.createdAt || Date.now(),
          completedAt: sub.completedAt,
          overallScore: sub.rubricEvaluation?.overallScore,
          videoLength: sub.duration ? formatDuration(sub.duration) : undefined,
          aiSentiment: sub.analysis?.sentiment,
          flagged: sub.flagged,
          flagReason: sub.flagReason,
        })));
      }
    } catch (err) {
      console.error('[AssignmentDashboard] Regrade error:', err);
    } finally {
      setIsRegrading(false);
    }
  };

  const handleExport = () => {
    window.open(`/api/bulk/export?batchId=${batchId}`, '_blank');
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    setDeletingId(submissionId);
    try {
      const res = await fetch(`/api/bulk/submissions?id=${submissionId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        // Remove from local state
        setSubmissions(prev => prev.filter(s => s.id !== submissionId));
        setShowDeleteConfirm(null);
      } else {
        console.error('Failed to delete submission');
      }
    } catch (err) {
      console.error('[AssignmentDashboard] Delete error:', err);
    } finally {
      setDeletingId(null);
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

  if (error || !batch) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-surface-700">{error || 'Batch not found'}</p>
          <Link href="/courses" className="mt-4 text-primary-600 hover:underline">
            ← Back to Courses
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Back Button + Breadcrumb */}
        <div className="flex items-center gap-4 mb-4">
          <Link
            href={`/courses?courseId=${courseId}`}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-surface-200 hover:bg-surface-50 hover:border-primary-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-surface-600" />
          </Link>
          <nav className="flex items-center gap-2 text-sm text-surface-500">
            <Link href="/courses" className="hover:text-primary-600 transition-colors">Courses</Link>
            <ChevronRight className="w-4 h-4" />
            <Link href={`/courses?courseId=${courseId}`} className="hover:text-primary-600 transition-colors">
              {batch.courseName || 'Course'}
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-surface-900 font-medium">{batch.name}</span>
          </nav>
              </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
              <div>
            <h1 className="text-2xl font-bold text-surface-900">{batch.name}</h1>
            <p className="text-surface-500 mt-1">
              {batch.term && `${batch.term} • `}
              {batch.courseCode && `${batch.courseCode} • `}
              Section B
            </p>
            </div>
            <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 text-sm font-medium text-surface-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            {/* Show Start Grading button when there are queued submissions */}
            {showStartGrading ? (
              <button
                onClick={handleStartGrading}
                disabled={isStartingGrading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium disabled:opacity-50"
              >
                {isStartingGrading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Start Grading ({submissions.filter(s => s.status === 'queued').length})
              </button>
            ) : showGradingInProgress ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                Grading in Progress...
              </div>
            ) : submissions.length > 0 ? (
              <button
                onClick={handleRegrade}
                disabled={isRegrading}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium disabled:opacity-50"
              >
                {isRegrading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Re-grade All
              </button>
            ) : null}
        </div>
      </div>

        {/* Upload Progress Banner */}
        {uploadsInProgress && (
          <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-900">Uploading Files</h3>
                  <p className="text-sm text-surface-600">
                    {submissions.length} of {expectedUploads} files uploaded
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                <span className="text-sm font-medium text-primary-700">{uploadProgress}%</span>
              </div>
            </div>
            <div className="h-2 bg-primary-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {/* Total Submissions */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Total Submissions</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">{batch.totalSubmissions}</span>
              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />
                +12% vs LY
              </span>
            </div>
            <div className="mt-3 h-1.5 bg-primary-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>

          {/* Average Score */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Average Score</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">
                {stats.avgScore !== undefined ? `${stats.avgScore}%` : '--'}
              </span>
              {stats.avgScore !== undefined && (
                <span className="text-xs text-emerald-600">+3.2 pts</span>
                )}
              </div>
            <div className="mt-3 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div
                className="h-full bg-emerald-500 rounded-full" 
                style={{ width: `${stats.avgScore || 0}%` }} 
                  />
                </div>
                </div>

          {/* Pending Review */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Pending Review</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">{stats.pending}</span>
              <span className="text-xs text-surface-500">Needs manual check</span>
              </div>
            <div className="mt-3 flex items-center gap-1.5 text-amber-600">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Processing</span>
            </div>
          </div>

          {/* Flagged for AI Check */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Flagged for AI Check</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">{stats.flagged}</span>
              <span className="text-xs text-red-500">Suspicious activity</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-red-500">
              <Flag className="w-4 h-4" />
              <span className="text-xs">Review required</span>
          </div>
          </div>
        </div>

        {/* Submissions Table */}
        <div className="bg-white rounded-xl border border-surface-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <h2 className="font-semibold text-surface-900">Student Submissions</h2>
            <button className="flex items-center gap-2 px-3 py-1.5 text-surface-500 hover:text-surface-700 text-sm">
              <Filter className="w-4 h-4" />
              Filter
                    </button>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    Student Name
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    Video Length
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    Auto-Grade
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    AI Sentiment
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubmissions.map((submission) => (
                  <tr key={submission.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium">
                          {getInitials(submission.studentName)}
                        </div>
                        <div>
                          <p className="font-medium text-surface-900">{submission.studentName}</p>
                          <p className="text-xs text-surface-500">{getTimeAgo(submission.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-surface-700">
                      {submission.videoLength || '--'}
                    </td>
                    <td className="px-6 py-4">
                      {submission.status === 'ready' && submission.overallScore !== undefined ? (
                      <div className="flex items-center gap-2">
                          <span className="font-semibold text-surface-900">
                            {Math.round(submission.overallScore)}/100
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            submission.overallScore >= 90 ? 'bg-emerald-100 text-emerald-700' :
                            submission.overallScore >= 70 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {submission.overallScore >= 90 ? 'PASS' : 
                             submission.overallScore >= 70 ? 'PENDING' : 'FLAGGED'}
                          </span>
                      </div>
                      ) : submission.status === 'failed' ? (
                        <span className="text-red-500 text-sm">Failed</span>
                      ) : (
                        <span className="text-surface-400">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {submission.status === 'ready' && submission.overallScore !== undefined ? (
                        <div className="flex items-center gap-2">
                          {getSentimentIcon(submission.aiSentiment)}
                          <span className={getSentimentColor(submission.aiSentiment)}>
                            {submission.aiSentiment || '--'}
                          </span>
                        </div>
                      ) : submission.status === 'queued' ? (
                        <span className="text-surface-400 text-sm">Awaiting grading</span>
                      ) : ['transcribing', 'analyzing'].includes(submission.status) ? (
                        <span className="text-amber-600 text-sm">Processing...</span>
                      ) : (
                        <span className="text-surface-400">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {submission.status === 'ready' && submission.overallScore !== undefined ? (
                          <Link
                            href={`/bulk/submission/${submission.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Link>
                        ) : submission.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500">
                            <AlertCircle className="w-4 h-4" />
                            Failed
                          </span>
                        ) : submission.flagged ? (
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                            <Flag className="w-4 h-4" />
                            Audit
                          </button>
                        ) : ['transcribing', 'analyzing'].includes(submission.status) ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Grading...
                          </span>
                        ) : submission.status === 'queued' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-surface-500">
                            <Clock className="w-4 h-4" />
                            Awaiting
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-surface-400">
                            --
                          </span>
                        )}
                        
                        {/* Delete Button with Confirmation */}
                        <div className="relative">
                          {showDeleteConfirm === submission.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg p-1">
                              <button
                                onClick={() => handleDeleteSubmission(submission.id)}
                                disabled={deletingId === submission.id}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
                              >
                                {deletingId === submission.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'Confirm'
                                )}
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-2 py-1 text-xs font-medium text-surface-600 hover:text-surface-800 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowDeleteConfirm(submission.id)}
                              className="p-1.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete submission"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-surface-200">
              <p className="text-sm text-surface-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} of {submissions.length} submissions
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-primary-500 text-white'
                        : 'hover:bg-surface-100 text-surface-700'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
                </div>
          )}

          {/* Empty State */}
          {submissions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-surface-500">No submissions yet</p>
                <Link
                href={`/bulk?batchId=${batchId}`}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
                >
                Upload Submissions
                </Link>
              </div>
        )}
        </div>
    </div>
    </DashboardLayout>
  );
}
