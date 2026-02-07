'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Download, RefreshCw, ChevronLeft, ChevronRight, Filter,
  Loader2, AlertTriangle, TrendingUp, Clock, Flag, Eye,
  Play, AlertCircle, CheckCircle, ArrowLeft, Trash2, MoreVertical, Upload, Plus, X
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

// ============================================
// Types
// ============================================

// GRADING STATUS: Single source of truth enum (matches API)
// Grading is fully automated - these are system states, not user action states.
type GradingStatusType = 'not_started' | 'processing' | 'finalizing' | 'completed' | 'retrying';

interface GradingStatus {
  status: GradingStatusType;
  gradedCount: number;
  totalCount: number;
  message: string;
}

interface Submission {
  id: string;
  studentName: string;
  originalFilename: string;
  status: 'queued' | 'uploading' | 'transcribing' | 'analyzing' | 'ready' | 'failed';
  createdAt: number;
  completedAt?: number;
  overallScore?: number | null;
  hasGradeData?: boolean; // True only if overallScore is defined
  aiSentiment?: 'Confident' | 'Moderate' | 'Engaging' | 'Script Reading?' | 'Uncertain';
  videoLength?: string;
  flagged?: boolean;
  flagReason?: string;
  /** Regrade version: 1 = original (no badge), 2+ = show "2nd grading", "3rd grading", etc. */
  gradingCount?: number;
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
  // ============================================
  // UPLOAD TRACKING: Persistent expected upload count
  // Stored in batch for consistent progress across page refreshes
  // ============================================
  expectedUploadCount?: number;
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

function ordinalGradingLabel(count: number): string {
  if (count <= 1) return '';
  const ordinals: Record<number, string> = {
    2: '2nd',
    3: '3rd',
    4: '4th',
    5: '5th',
  };
  const ord = ordinals[count] || `${count}th`;
  return `${ord} grading`;
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
  
  // ============================================
  // UPLOAD TRACKING: Use stored expectedUploadCount from batch (persistent)
  // Falls back to URL param for backward compatibility during initial navigation
  // ============================================
  const urlExpectedUploads = parseInt(searchParams.get('uploading') || '0', 10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // ============================================
  // HIGH WATER MARK: Prevent counts from going backwards
  // Once we've seen N submissions, never show fewer than N
  // This prevents UI flickering due to eventual consistency
  // ============================================
  const [submissionHighWaterMark, setSubmissionHighWaterMark] = useState(0);
  const [gradedHighWaterMark, setGradedHighWaterMark] = useState(0);
  // ============================================
  // STATUS LOCK: Once completed, don't regress to processing
  // Using a ref to avoid stale closure issues in setGradingStatus
  // ============================================
  const statusLockedRef = useRef<'completed' | null>(null);
  // GRADING STATUS: Single source of truth from API
  const [gradingStatus, setGradingStatus] = useState<GradingStatus>({
    status: 'not_started',
    gradedCount: 0,
    totalCount: 0,
    message: '',
  });
  const [isRegrading, setIsRegrading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ============================================
  // SELECTIVE RE-GRADE: Allow users to pick which submissions to re-grade
  // ============================================
  const [regradeMode, setRegradeMode] = useState(false);
  const [selectedForRegrade, setSelectedForRegrade] = useState<Set<string>>(new Set());
  /** IDs currently being regraded; block View link until they have hasGradeData again */
  const [submissionIdsRegrading, setSubmissionIdsRegrading] = useState<Set<string>>(new Set());
  /** AbortController for current regrade session; abort when a new regrade starts */
  const regradeAbortRef = useRef<AbortController | null>(null);

  // ============================================
  // ADD MORE UPLOADS: State for uploading additional files
  // ============================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{id: string; name: string; progress: number}[]>([]);

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
          // Upload tracking from persistent storage
          expectedUploadCount: batchData.batch.expectedUploadCount,
        });

        // GRADING STATUS: Set from API response with high water mark protection
        if (batchData.gradingStatus) {
          const newStatus = batchData.gradingStatus;
          setGradingStatus(prev => ({
            ...newStatus,
            // Never let graded count go backwards
            gradedCount: Math.max(newStatus.gradedCount, prev.gradedCount),
          }));
          setGradedHighWaterMark(prev => Math.max(prev, newStatus.gradedCount));
          
          // Lock status if completed OR if all submissions have grades
          // This handles the case where we're navigating back to a completed batch
          const allHaveGrades = batchData.submissions?.every(
            (s: any) => s.hasGradeData && s.overallScore != null
          );
          if (newStatus.status === 'completed' || (batchData.submissions?.length > 0 && allHaveGrades)) {
            statusLockedRef.current = 'completed';
          }
        }

        // Map submissions - use hasGradeData from API
        const subs: Submission[] = (batchData.submissions || []).map((sub: any) => ({
          id: sub.id,
          studentName: sub.studentName || 'Unknown Student',
          originalFilename: sub.originalFilename || 'Unknown',
          status: sub.status,
          createdAt: sub.createdAt || Date.now(),
          completedAt: sub.completedAt,
          overallScore: sub.overallScore,
          hasGradeData: sub.hasGradeData ?? false,
          videoLength: sub.duration ? formatDuration(sub.duration) : undefined,
          aiSentiment: sub.analysis?.sentiment || (sub.hasGradeData ? 'Confident' : undefined),
          flagged: sub.flagged,
          flagReason: sub.flagReason,
          gradingCount: sub.gradingCount,
        }));

        // Update submissions and high water mark
        setSubmissions(subs);
        setSubmissionHighWaterMark(prev => Math.max(prev, subs.length));
      } catch (err) {
        console.error('[AssignmentDashboard] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [batchId, courseId]);

  // Grading state
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [gradingStarted, setGradingStarted] = useState(false);
  const [gradingStartTime, setGradingStartTime] = useState<number | null>(null);
  const [completedDuringSession, setCompletedDuringSession] = useState(0);
  const [activeWorkers, setActiveWorkers] = useState(0);
  const [autoResumeAttempted, setAutoResumeAttempted] = useState(false);

  // Calculate estimated time remaining
  const getTimeEstimate = () => {
    if (!gradingStartTime || completedDuringSession === 0) return null;
    
    const elapsed = Date.now() - gradingStartTime;
    const avgTimePerSubmission = elapsed / completedDuringSession;
    const remaining = submissions.filter(s => 
      s.status === 'queued' || s.status === 'transcribing' || s.status === 'analyzing'
    ).length;
    
    if (remaining === 0) return null;
    
    const estimatedMs = avgTimePerSubmission * remaining;
    const minutes = Math.ceil(estimatedMs / 60000);
    
    if (minutes < 1) return 'Less than a minute';
    if (minutes === 1) return '~1 minute';
    return `~${minutes} minutes`;
  };

  // Process a single submission and return when done
  const processOneSubmission = async (workerNum: number): Promise<boolean> => {
    try {
      console.log(`[AssignmentDashboard] Worker ${workerNum} processing...`);
      const res = await fetch(`/api/bulk/process-now?batchId=${batchId}`, { method: 'POST' });
      const data = await res.json();
      console.log(`[AssignmentDashboard] Worker ${workerNum} completed:`, data);
      
      if (data.processed > 0) {
        setCompletedDuringSession(prev => prev + 1);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[AssignmentDashboard] Worker ${workerNum} failed:`, err);
      return false;
    }
  };

  // Worker that keeps processing until no more queued submissions
  const runWorker = async (workerId: number) => {
    setActiveWorkers(prev => prev + 1);
    let processed = true;
    
    while (processed) {
      processed = await processOneSubmission(workerId);
      // No delay - immediately grab next submission for maximum throughput
    }
    
    setActiveWorkers(prev => prev - 1);
  };

  const handleStartGrading = async () => {
    // Don't start grading while uploads are still in progress
    const expected = batch?.expectedUploadCount || urlExpectedUploads;
    if (expected > 0 && submissions.length < expected) {
      console.log(`[AssignmentDashboard] Cannot start grading - uploads in progress (${submissions.length}/${expected})`);
      return;
    }
    
    const queuedCount = submissions.filter(s => s.status === 'queued').length;
    if (queuedCount === 0) return;

    setIsStartingGrading(true);
    setGradingStarted(true);
    setGradingStartTime(Date.now());
    setCompletedDuringSession(0);
    console.log(`[AssignmentDashboard] Starting grading for ${queuedCount} submissions`);

    // ============================================
    // PARALLEL WORKERS: Scale to match uploads, cap at 20
    // Each worker continuously processes until queue is empty
    // 20 workers for faster throughput - APIs can handle it
    // ============================================
    const MAX_WORKERS = 20;
    const numWorkers = Math.min(queuedCount, MAX_WORKERS);
    console.log(`[AssignmentDashboard] Launching ${numWorkers} parallel workers`);
    
    // Don't await - let workers run in background
    for (let i = 0; i < numWorkers; i++) {
      runWorker(i + 1);
    }
    
    setIsStartingGrading(false);
  };

  // Check if grading is in progress (for UI state)
  const hasQueuedSubmissions = submissions.some(s => s.status === 'queued');
  const hasActiveProcessing = submissions.some(s => 
    ['transcribing', 'analyzing'].includes(s.status)
  );
  const allProcessed = submissions.length > 0 && submissions.every(s => 
    s.status === 'ready' || s.status === 'failed'
  );

  // Reset gradingStarted if all submissions are processed and no active workers
  useEffect(() => {
    if (allProcessed && gradingStarted && activeWorkers === 0) {
      setGradingStarted(false);
      setGradingStartTime(null);
    }
  }, [allProcessed, gradingStarted, activeWorkers]);

  // Clear submissionIdsRegrading once all those submissions have grades again
  useEffect(() => {
    if (submissionIdsRegrading.size === 0) return;
    const idList = Array.from(submissionIdsRegrading);
    const allDone = idList.every(id => {
      const s = submissions.find(x => x.id === id);
      return s?.hasGradeData === true;
    });
    if (allDone) setSubmissionIdsRegrading(new Set());
  }, [submissions, submissionIdsRegrading]);

  // ============================================
  // AUTO-RESUME: Continue grading on page refresh
  // If there are queued submissions (and uploads complete) or stuck processing,
  // automatically start grading workers
  // ============================================
  useEffect(() => {
    // Only attempt auto-resume once per page load
    if (autoResumeAttempted || loading || gradingStarted || activeWorkers > 0) return;
    
    // Calculate expected uploads from batch (persistent) or URL (fallback)
    const expected = batch?.expectedUploadCount || urlExpectedUploads;
    const uploadsStillInProgress = expected > 0 && submissions.length < expected;
    
    // Don't auto-resume while uploads are still in progress
    if (uploadsStillInProgress) return;
    
    // Check if we have work to resume
    const queuedCount = submissions.filter(s => s.status === 'queued').length;
    const stuckCount = submissions.filter(s => 
      ['transcribing', 'analyzing'].includes(s.status)
    ).length;
    
    // Auto-resume if there are queued or stuck submissions
    if (queuedCount > 0 || stuckCount > 0) {
      console.log(`[AssignmentDashboard] Auto-resuming grading: ${queuedCount} queued, ${stuckCount} stuck`);
      setAutoResumeAttempted(true);
      
      // Start grading automatically
      setGradingStarted(true);
      setGradingStartTime(Date.now());
      
      // Start workers - scale to match queued items, cap at 20
      const MAX_WORKERS = 20;
      const numWorkers = Math.min(queuedCount + stuckCount, MAX_WORKERS);
      console.log(`[AutoResume] Launching ${numWorkers} workers for ${queuedCount} queued + ${stuckCount} stuck`);
      for (let i = 0; i < numWorkers; i++) {
        runWorker(i + 1);
      }
    } else {
      setAutoResumeAttempted(true);
    }
  }, [loading, submissions, batch, urlExpectedUploads, autoResumeAttempted, gradingStarted, activeWorkers]);

  // ============================================
  // UPLOAD TRACKING: Use stored expectedUploadCount from batch (persistent)
  // Falls back to URL param for backward compatibility during initial navigation
  // NEVER show upload progress for completed batches
  // ============================================
  const expectedUploads = batch?.expectedUploadCount || urlExpectedUploads;
  const isCompleted = batch?.status === 'completed' || gradingStatus.status === 'completed';
  const uploadsInProgress = !isCompleted && expectedUploads > 0 && submissions.length < expectedUploads;
  const uploadProgress = expectedUploads > 0 ? Math.round((submissions.length / expectedUploads) * 100) : 100;

  // Poll for updates (also poll when waiting for uploads or grading)
  useEffect(() => {
    if (!batchId) return;

    const hasActiveWork = submissions.some(s => 
      ['queued', 'uploading', 'transcribing', 'analyzing'].includes(s.status)
    );
    
    // Check if grades are still being finalized (status says ready but no score yet)
    const hasPendingGrades = submissions.some(s => 
      s.status === 'ready' && !s.hasGradeData
    );
    
    // GRADING STATUS: Continue polling until grading is truly complete
    // Includes 'finalizing' and 'processing' states where scores are being written
    const gradingNotComplete = ['processing', 'finalizing', 'retrying'].includes(gradingStatus.status);

    // Keep polling if uploads are expected, grading started, active work, or grades pending
    const shouldPoll = hasActiveWork || uploadsInProgress || gradingStarted || hasPendingGrades || gradingNotComplete || submissions.length === 0;
    if (!shouldPoll && submissions.length > 0 && gradingStatus.status === 'completed') return;

    // Poll faster when grading or uploads are in progress
    // Reduced to 1s for real-time feedback during active processing
    const pollInterval = (uploadsInProgress || gradingStarted || hasPendingGrades) ? 1000 : 2000;
    
    console.log(`[AssignmentDashboard] Polling enabled: hasActiveWork=${hasActiveWork}, hasPendingGrades=${hasPendingGrades}, gradingStatus=${gradingStatus.status}, interval=${pollInterval}ms`);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
        const data = await res.json();

        if (data.submissions) {
          console.log(`[AssignmentDashboard] Poll received ${data.submissions.length} submissions:`, 
            data.submissions.map((s: any) => ({ id: s.id.slice(-6), status: s.status, score: s.overallScore, hasGrade: s.hasGradeData }))
          );
          
          // ============================================
          // GRADING STATUS: Update with high water mark and status lock
          // - Never let graded count go backwards
          // - Once completed, don't regress to processing
          // - Use ref to avoid stale closure issues
          // ============================================
          if (data.gradingStatus) {
            const newStatus = data.gradingStatus;
            const currentLock = statusLockedRef.current;
            
            // Check if new uploads were added (unlocks the completed status)
            const isNewUploadsAdded = newStatus.gradedCount < newStatus.totalCount && currentLock === 'completed';
            
            // Determine final status - use ref for current lock value
            let finalStatus = newStatus.status;
            if (currentLock === 'completed' && !isNewUploadsAdded) {
              // Keep completed status if locked and no new uploads
              finalStatus = 'completed';
            }
            
            // Also check locally: if ALL submissions have grades, force completed
            const allSubmissionsGraded = data.submissions?.length > 0 && 
              data.submissions.every((s: any) => s.hasGradeData && s.overallScore != null);
            if (allSubmissionsGraded) {
              finalStatus = 'completed';
              statusLockedRef.current = 'completed';
            }
            
            setGradingStatus(prev => ({
              ...newStatus,
              status: finalStatus,
              // Apply high water mark - never let graded count go backwards
              gradedCount: Math.max(newStatus.gradedCount, prev.gradedCount),
            }));
            
            // Update high water mark
            setGradedHighWaterMark(prev => Math.max(prev, newStatus.gradedCount));
            
            // Lock status if completed
            if (newStatus.status === 'completed' || allSubmissionsGraded) {
              statusLockedRef.current = 'completed';
            }
          }
          
          // Map fresh data from server
          const updatedSubs: Submission[] = data.submissions.map((sub: any) => ({
            id: sub.id,
            studentName: sub.studentName || 'Unknown Student',
            originalFilename: sub.originalFilename || 'Unknown',
            status: sub.status,
            createdAt: sub.createdAt || Date.now(),
            completedAt: sub.completedAt,
            overallScore: sub.overallScore,
            hasGradeData: sub.hasGradeData ?? false,
            videoLength: undefined,
            aiSentiment: sub.analysis?.sentiment || (sub.hasGradeData ? 'Confident' : undefined),
            flagged: sub.flagged,
            flagReason: sub.flagReason,
            gradingCount: sub.gradingCount,
          }));
          
          // ============================================
          // SUBMISSION UPDATE: Merge server data with local state
          // - If submission was explicitly regraded (status='queued'), use new data
          // - Otherwise preserve grade data to prevent flicker
          // - Never show fewer submissions than we've seen
          // ============================================
          setSubmissions(prev => {
            const prevMap = new Map(prev.map(s => [s.id, s]));
            
            // Merge submissions
            const mergedSubs = updatedSubs.map(newSub => {
              const existingSub = prevMap.get(newSub.id);
              
              // If submission is now queued/processing, it's being regraded - use server data
              // This allows regrades to show proper status even if previously graded
              if (['queued', 'transcribing', 'analyzing'].includes(newSub.status)) {
                return newSub;
              }
              
              // If existing submission has grade data and new doesn't, preserve existing
              // (protects against transient API inconsistencies during normal grading)
              if (existingSub?.hasGradeData && existingSub.overallScore != null) {
                if (newSub.hasGradeData && newSub.overallScore != null) {
                  return newSub; // New grade available, use it
                }
                // Keep existing graded data (prevents flicker)
                return existingSub;
              }
              
              return newSub;
            });
            
            if (mergedSubs.length >= prev.length) {
              setSubmissionHighWaterMark(mark => Math.max(mark, mergedSubs.length));
              return mergedSubs;
            } else {
              // Fewer submissions from server - merge into existing to prevent count drop
              const mergedMap = new Map(mergedSubs.map(s => [s.id, s]));
              return prev.map(s => {
                const updated = mergedMap.get(s.id);
                if (!updated) return s;
                // If regrading (queued status), use server data
                if (['queued', 'transcribing', 'analyzing'].includes(updated.status)) {
                  return updated;
                }
                // Preserve grade if existing has it and new doesn't
                if (s.hasGradeData && s.overallScore != null && (!updated.hasGradeData || updated.overallScore == null)) {
                  return s;
                }
                return updated;
              });
            }
          });
          
          if (data.batch) {
            setBatch(prev => prev ? {
              ...prev,
              processedCount: data.batch.processedCount || 0,
              failedCount: data.batch.failedCount || 0,
              averageScore: data.batch.averageScore,
              totalSubmissions: data.batch.totalSubmissions || prev.totalSubmissions,
              // Preserve higher expectedUploadCount to avoid overwrites during active uploads
              // If local is higher than server, keep local (we're adding more files)
              expectedUploadCount: Math.max(
                prev.expectedUploadCount || 0, 
                data.batch.expectedUploadCount || 0
              ) || undefined,
            } : null);
          }
        }
      } catch (err) {
        console.error('[AssignmentDashboard] Poll error:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [batchId, submissions, uploadsInProgress, expectedUploads, gradingStarted, gradingStatus.status]);

  // Derived stats
  const stats = useMemo(() => {
    const graded = submissions.filter(s => 
      s.hasGradeData && s.overallScore != null
    ).length;
    const pending = submissions.filter(s => 
      ['queued', 'transcribing', 'analyzing'].includes(s.status)
    ).length;
    const flagged = submissions.filter(s => s.flagged).length;
    const scores = submissions
      .filter(s => s.overallScore !== undefined && s.overallScore !== null)
      .map(s => s.overallScore!);
    const avgScore = scores.length > 0 
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : undefined;
    
    return { graded, pending, flagged, avgScore, total: submissions.length };
  }, [submissions]);

  // ============================================
  // DISPLAY STATUS: Computed purely from actual submissions data
  // This is the SINGLE SOURCE OF TRUTH for UI - ignores stale API state
  // ============================================
  const displayGradingStatus = useMemo(() => {
    // No submissions yet - show not_started
    if (stats.total === 0) {
      return {
        status: 'not_started' as const,
        gradedCount: 0,
        totalCount: 0,
        message: 'No submissions yet',
      };
    }
    
    // If all submissions have grades, we're ALWAYS complete
    // This takes precedence over any API state
    const allGraded = stats.graded === stats.total;
    
    // Check if any submissions are pending (queued/processing)
    const hasPending = stats.pending > 0;
    
    if (allGraded && !hasPending) {
      // All done - lock this state
      statusLockedRef.current = 'completed';
      return {
        status: 'completed' as const,
        gradedCount: stats.graded,
        totalCount: stats.total,
        message: 'All submissions successfully evaluated',
      };
    }
    
    // Some are still processing
    if (hasPending) {
      return {
        status: 'processing' as const,
        gradedCount: stats.graded,
        totalCount: stats.total,
        message: `${stats.graded} of ${stats.total} completed`,
      };
    }
    
    // Edge case: some graded, some failed, none pending
    if (stats.graded > 0 && stats.graded < stats.total) {
      return {
        status: 'processing' as const,
        gradedCount: stats.graded,
        totalCount: stats.total,
        message: `${stats.graded} of ${stats.total} completed`,
      };
    }
    
    // Default - use API status with actual counts
    return {
      status: gradingStatus.status,
      gradedCount: stats.graded,
      totalCount: stats.total,
      message: gradingStatus.message,
    };
  }, [gradingStatus, stats]);

  // Pagination
  const totalPages = Math.ceil(submissions.length / itemsPerPage);
  const paginatedSubmissions = submissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ============================================
  // SELECTIVE RE-GRADE: Handlers
  // ============================================
  const toggleRegradeMode = () => {
    if (regradeMode) {
      // Exiting regrade mode - clear selections
      setRegradeMode(false);
      setSelectedForRegrade(new Set());
    } else {
      // Entering regrade mode
      setRegradeMode(true);
    }
  };

  const toggleSubmissionForRegrade = (id: string) => {
    setSelectedForRegrade(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCancelRegrade = () => {
    regradeAbortRef.current?.abort();
    setSubmissionIdsRegrading(new Set());
    setIsRegrading(false);
  };

  const handleRegradeSelected = async () => {
    if (selectedForRegrade.size === 0) return;
    
    // Cancel any in-flight regrade (previous API + worker requests)
    regradeAbortRef.current?.abort();
    const controller = new AbortController();
    regradeAbortRef.current = controller;
    const signal = controller.signal;

    const submissionIdsToRegrade = Array.from(selectedForRegrade);
    setIsRegrading(true);
    setSubmissionIdsRegrading(new Set(submissionIdsToRegrade));
    try {
      console.log(`[Regrade] Starting regrade for ${submissionIdsToRegrade.length} submissions (selected only)`);
      
      const regradeRes = await fetch(`/api/bulk/regrade`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionIds: submissionIdsToRegrade }),
        signal,
      });
      const regradeData = await regradeRes.json();
      console.log(`[Regrade] API response:`, regradeData);
      
      if (signal.aborted) return;
      
      // Exit regrade mode and clear selections
      setRegradeMode(false);
      setSelectedForRegrade(new Set());
      
      // Unlock status to allow showing processing
      statusLockedRef.current = null;
      setGradingStarted(true);
      setGradingStartTime(Date.now());
      
      // Refetch data immediately
      const res = await fetch(`/api/bulk/status?batchId=${batchId}`, { signal });
      const data = await res.json();
      if (signal.aborted) return;
      if (data.submissions) {
        const subs = data.submissions.map((sub: any) => ({
          id: sub.id,
          studentName: sub.studentName || 'Unknown Student',
          originalFilename: sub.originalFilename || 'Unknown',
          status: sub.status,
          createdAt: sub.createdAt || Date.now(),
          completedAt: sub.completedAt,
          overallScore: sub.overallScore,
          hasGradeData: sub.hasGradeData ?? false,
          videoLength: sub.duration ? formatDuration(sub.duration) : undefined,
          aiSentiment: sub.analysis?.sentiment,
          flagged: sub.flagged,
          flagReason: sub.flagReason,
          gradingCount: sub.gradingCount,
        }));
        setSubmissions(subs);
        
        // Update grading status
        if (data.gradingStatus) {
          setGradingStatus(data.gradingStatus);
        }
      }
      
      // Start workers; they respect the same abort signal so a new regrade cancels these
      const MAX_WORKERS = 10;
      const numWorkers = Math.min(submissionIdsToRegrade.length, MAX_WORKERS);
      
      const workerPromises = Array.from({ length: numWorkers }, async (_, i) => {
        const workerId = i + 1;
        while (!signal.aborted) {
          try {
            const workerRes = await fetch(`/api/bulk/process-now?batchId=${batchId}`, { method: 'POST', signal });
            const workerData = await workerRes.json();
            if (signal.aborted) break;
            if (workerData.processed > 0) {
              await new Promise(r => setTimeout(r, 500));
            } else {
              break;
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') break;
            console.error(`[Regrade] Worker ${workerId} error:`, err);
            break;
          }
        }
      });
      
      // Run workers in background; don't await so we can exit and let new regrade abort these
      Promise.all(workerPromises).then(() => {
        if (!signal.aborted) console.log(`[Regrade] All workers finished`);
      });
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Regrade] Previous regrade aborted');
        return;
      }
      console.error('[AssignmentDashboard] Regrade error:', err);
    } finally {
      // Only clear if this session is still the active one (not superseded by a new regrade)
      if (regradeAbortRef.current === controller) {
        setIsRegrading(false);
      }
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
        // Remove from local state and update high water mark
        setSubmissions(prev => {
          const filtered = prev.filter(s => s.id !== submissionId);
          setSubmissionHighWaterMark(filtered.length); // Allow decrease for explicit delete
          return filtered;
        });
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

  // ============================================
  // ADD MORE UPLOADS: Handle additional file uploads
  // ============================================
  const inferStudentName = useCallback((filename: string): string => {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(mp4|mov|webm|mp3|wav)$/i, '');
    // Try to extract student name from common patterns
    const patterns = [
      /^(.+?)[-_]\d+$/,  // "John Smith-001" or "John_Smith_001"
      /^(.+?)[-_]video$/i, // "John Smith-video"
      /^(.+?)[-_]presentation$/i, // "John Smith-presentation"
    ];
    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) return match[1].replace(/[-_]/g, ' ').trim();
    }
    return nameWithoutExt.replace(/[-_]/g, ' ').trim();
  }, []);

  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !batchId) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm'];
    const validFiles = Array.from(files).filter(file => 
      validTypes.some(t => file.type.startsWith(t.split('/')[0]))
    );

    if (validFiles.length === 0) return;

    setIsUploading(true);
    
    // Update expected upload count in batch (client + server)
    const newExpectedCount = (batch?.expectedUploadCount || submissions.length) + validFiles.length;
    setBatch(prev => prev ? { ...prev, expectedUploadCount: newExpectedCount } : null);
    
    // Persist to server so polling doesn't overwrite
    fetch(`/api/bulk/update-expected?batchId=${batchId}&count=${newExpectedCount}`, { method: 'POST' })
      .catch(err => console.error('[AddMore] Failed to update expected count:', err));

    // Track uploading files
    const uploadingList = validFiles.map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: f.name,
      progress: 0
    }));
    setUploadingFiles(uploadingList);

    try {
      // ============================================
      // CHUNKED PARALLEL UPLOADS: Upload N files at a time
      // This handles 100+ files efficiently without overwhelming browser
      // Browser limits to ~6 connections per domain, so 10 concurrent is optimal
      // ============================================
      const UPLOAD_CONCURRENCY = 10; // Upload 10 files at a time
      
      const uploadSingleFile = async (file: File, i: number): Promise<string | null> => {
        const studentName = inferStudentName(file.name);
        const uploadId = uploadingList[i].id;

        try {
          // Update progress - getting presigned URL
          setUploadingFiles(prev => prev.map(uf => 
            uf.id === uploadId ? { ...uf, progress: 10 } : uf
          ));

          // Get presigned URL
          const presignRes = await fetch('/api/bulk/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId,
              filename: file.name,
              contentType: file.type,
            }),
          });
          const presignData = await presignRes.json();

          if (!presignData.success) {
            console.error('Failed to get presign URL:', presignData.error);
            setUploadingFiles(prev => prev.map(uf => 
              uf.id === uploadId ? { ...uf, progress: -1 } : uf
            ));
            return null;
          }

          setUploadingFiles(prev => prev.map(uf => 
            uf.id === uploadId ? { ...uf, progress: 20 } : uf
          ));

          // Upload to R2
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const progress = 20 + Math.round((e.loaded / e.total) * 70);
                setUploadingFiles(prev => prev.map(uf => 
                  uf.id === uploadId ? { ...uf, progress } : uf
                ));
              }
            });
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
              }
            });
            xhr.addEventListener('error', () => reject(new Error('Upload failed')));
            xhr.open('PUT', presignData.uploadUrl);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
          });

          setUploadingFiles(prev => prev.map(uf => 
            uf.id === uploadId ? { ...uf, progress: 95 } : uf
          ));

          // Enqueue for processing
          const enqueueRes = await fetch('/api/bulk/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId,
              submissionId: presignData.submissionId,
              fileKey: presignData.fileKey,
              studentName,
              originalFilename: file.name,
              fileSize: file.size,
              mimeType: file.type,
            }),
          });
          
          if (!enqueueRes.ok) {
            const errData = await enqueueRes.json();
            console.error(`[AddMore] Enqueue failed for ${file.name}:`, errData);
            throw new Error(errData.error || 'Enqueue failed');
          }

          setUploadingFiles(prev => prev.map(uf => 
            uf.id === uploadId ? { ...uf, progress: 100 } : uf
          ));

          return presignData.submissionId;
        } catch (err) {
          console.error(`[AddMore] Upload failed for ${file.name}:`, err);
          setUploadingFiles(prev => prev.map(uf => 
            uf.id === uploadId ? { ...uf, progress: -1 } : uf
          ));
          return null;
        }
      };

      // Process files in chunks with controlled concurrency
      console.log(`[AddMore] Starting upload of ${validFiles.length} files (${UPLOAD_CONCURRENCY} concurrent)...`);
      
      const results: (string | null)[] = [];
      for (let i = 0; i < validFiles.length; i += UPLOAD_CONCURRENCY) {
        const chunk = validFiles.slice(i, i + UPLOAD_CONCURRENCY);
        const chunkIndices = chunk.map((_, idx) => i + idx);
        
        console.log(`[AddMore] Uploading chunk ${Math.floor(i / UPLOAD_CONCURRENCY) + 1} of ${Math.ceil(validFiles.length / UPLOAD_CONCURRENCY)} (files ${i + 1}-${Math.min(i + UPLOAD_CONCURRENCY, validFiles.length)})`);
        
        const chunkResults = await Promise.all(
          chunk.map((file, idx) => uploadSingleFile(file, chunkIndices[idx]))
        );
        results.push(...chunkResults);
      }
      
      const successCount = results.filter(r => r !== null).length;
      console.log(`[AddMore] All uploads complete: ${successCount}/${validFiles.length} successful`);

      // Refresh data after uploads complete
      const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
      const data = await res.json();
      if (data.submissions) {
        const subs = data.submissions.map((sub: any) => ({
          id: sub.id,
          studentName: sub.studentName || 'Unknown Student',
          originalFilename: sub.originalFilename || 'Unknown',
          status: sub.status,
          createdAt: sub.createdAt || Date.now(),
          completedAt: sub.completedAt,
          overallScore: sub.overallScore,
          hasGradeData: sub.hasGradeData ?? false,
          videoLength: undefined,
          aiSentiment: sub.analysis?.sentiment,
          flagged: sub.flagged,
          flagReason: sub.flagReason,
          gradingCount: sub.gradingCount,
        }));
        setSubmissions(subs);
        setSubmissionHighWaterMark(prev => Math.max(prev, subs.length));

        // ============================================
        // AUTO-GRADE NEW UPLOADS: Start grading only for newly queued submissions
        // This does NOT re-grade already graded submissions
        // Fire processing requests directly to avoid closure issues
        // ============================================
        const newQueuedCount = subs.filter((s: Submission) => s.status === 'queued').length;
        if (newQueuedCount > 0) {
          console.log(`[AddMore] Auto-starting grading for ${newQueuedCount} new submissions`);
          
          // Unlock status to allow showing processing for new uploads
          statusLockedRef.current = null;
          setGradingStarted(true);
          setGradingStartTime(Date.now());
          
          // Fire parallel processing requests directly (not via runWorker to avoid closure issues)
          const MAX_WORKERS = 10;
          const numWorkers = Math.min(newQueuedCount, MAX_WORKERS);
          
          // Start workers that keep processing until queue is empty
          const workerPromises = Array.from({ length: numWorkers }, async (_, i) => {
            const workerId = i + 1;
            let keepProcessing = true;
            
            while (keepProcessing) {
              try {
                console.log(`[AddMore] Worker ${workerId} processing...`);
                const workerRes = await fetch(`/api/bulk/process-now?batchId=${batchId}`, { method: 'POST' });
                const workerData = await workerRes.json();
                console.log(`[AddMore] Worker ${workerId} result:`, workerData);
                
                if (workerData.processed > 0) {
                  // Successfully processed one, continue
                  await new Promise(r => setTimeout(r, 500)); // Small delay
                } else {
                  // Queue is empty for this worker
                  keepProcessing = false;
                }
              } catch (err) {
                console.error(`[AddMore] Worker ${workerId} error:`, err);
                keepProcessing = false;
              }
            }
            console.log(`[AddMore] Worker ${workerId} finished`);
          });
          
          // Don't await - let workers run in background
          Promise.all(workerPromises).then(() => {
            console.log(`[AddMore] All workers finished`);
          });
        }
      }
    } catch (err) {
      console.error('[AssignmentDashboard] Upload error:', err);
    } finally {
      setIsUploading(false);
      setUploadingFiles([]);
    }
  }, [batchId, batch, submissions.length, inferStudentName]);

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
            {/* Hidden file input for adding more submissions */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isUploading ? 'Uploading...' : 'Upload more'}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 text-sm font-medium text-surface-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            {/* Grading action button - uses gradingStatus from API (single source of truth) */}
            {(() => {
              const queuedCount = submissions.filter(s => s.status === 'queued').length;
              const isGradingActive = gradingStarted || hasActiveProcessing || activeWorkers > 0;
              
              // Don't show grading controls while uploads are in progress
              if (uploadsInProgress) {
                return null; // Upload progress banner handles this state
              }
              
              if (isStartingGrading) {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting Grading...
                  </div>
                );
              }
              
              // Show progress during active grading - but NOT if all are already graded
              if ((isGradingActive && !allProcessed) || (displayGradingStatus.status === 'processing' && stats.graded < stats.total)) {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Grading... ({displayGradingStatus.gradedCount}/{displayGradingStatus.totalCount})
                  </div>
                );
              }
              
              // Finalizing state - but NOT if all are already graded
              if (displayGradingStatus.status === 'finalizing' && stats.graded < stats.total) {
                return (
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-lg text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing Queue...
                  </div>
                );
              }
              
              if (queuedCount > 0 && !isGradingActive) {
                return (
                  <button
                    onClick={handleStartGrading}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    Start Grading ({queuedCount})
                  </button>
                );
              }
              
              // Only show Re-grade when grading is truly complete (use display status)
              if (submissions.length > 0 && displayGradingStatus.status === 'completed') {
                // If in regrade mode with selections, show "Re-grade Selected" button
                if (regradeMode && selectedForRegrade.size > 0) {
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleRegradeMode}
                        className="flex items-center gap-2 px-3 py-2 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRegradeSelected}
                        disabled={isRegrading}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium disabled:opacity-50"
                      >
                        {isRegrading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Re-grade ({selectedForRegrade.size})
                      </button>
                    </div>
                  );
                }
                
                // If in regrade mode but no selections yet
                if (regradeMode) {
                  return (
                    <button
                      onClick={toggleRegradeMode}
                      className="flex items-center gap-2 px-4 py-2 bg-surface-200 text-surface-700 rounded-lg hover:bg-surface-300 text-sm font-medium"
                    >
                      Cancel Selection
                    </button>
                  );
                }
                
                // Default: show button to enter regrade mode
                return (
                  <button
                    onClick={toggleRegradeMode}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 text-surface-700 rounded-lg hover:bg-surface-50 text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Re-grade
                  </button>
                );
              }
              
              return null;
            })()}
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

        {/* Additional Uploads Progress Banner */}
        {isUploading && uploadingFiles.length > 0 && (
          <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-surface-900">Adding Submissions</h3>
                <p className="text-sm text-surface-600">
                  Uploading {uploadingFiles.filter(f => f.progress < 100).length} of {uploadingFiles.length} files
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {uploadingFiles.map(file => (
                <div key={file.id} className="flex items-center gap-3">
                  <span className="text-sm text-surface-700 truncate flex-1 max-w-xs">{file.name}</span>
                  <div className="flex-1 h-2 bg-primary-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary-500 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-surface-500 w-10 text-right">{file.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Re-grading in progress: Cancel control */}
        {submissionIdsRegrading.size > 0 && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100">
                <RefreshCw className="h-4 w-4 text-violet-600 animate-spin" />
              </div>
              <p className="text-sm font-medium text-violet-900">
                Re-grading {submissionIdsRegrading.size} submission{submissionIdsRegrading.size !== 1 ? 's' : ''} in progress
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelRegrade}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-700 shadow-sm transition-colors hover:bg-violet-50 hover:border-violet-300"
            >
              <X className="h-4 w-4" />
              Cancel re-grade
            </button>
          </div>
        )}

        {/* Grading Progress Banner - uses displayGradingStatus (computed from actual data) */}
        {/* Only show if not all submissions are graded yet */}
        {displayGradingStatus.status === 'processing' && stats.graded < stats.total && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Play className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-900">Automated grading in progress</h3>
                  <p className="text-sm text-surface-600">
                    {displayGradingStatus.gradedCount} of {displayGradingStatus.totalCount} completed
                    {activeWorkers > 0 && ` • ${activeWorkers} active worker${activeWorkers > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getTimeEstimate() && (
                  <div className="flex items-center gap-2 text-amber-700">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">{getTimeEstimate()} remaining</span>
                  </div>
                )}
                <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
              </div>
            </div>
            <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ 
                  width: `${Math.round((displayGradingStatus.gradedCount / Math.max(displayGradingStatus.totalCount, 1)) * 100)}%` 
                }}
              />
            </div>
          </div>
        )}

        {/* Finalizing Banner - only show if not all submissions are graded yet */}
        {displayGradingStatus.status === 'finalizing' && stats.graded < stats.total && (
          <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-900">Finalizing results</h3>
                  <p className="text-sm text-surface-600">
                    Automated grading complete, processing final scores...
                  </p>
                </div>
              </div>
              <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
            </div>
          </div>
        )}

        {/* Retrying Banner - only show if not all submissions are graded yet */}
        {displayGradingStatus.status === 'retrying' && stats.graded < stats.total && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-surface-900">Automated grading retrying</h3>
                  <p className="text-sm text-surface-600">
                    {displayGradingStatus.message}
                  </p>
                </div>
              </div>
              <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
            </div>
          </div>
        )}

        {/* Grading Complete Banner - shows when all submissions are graded OR displayGradingStatus is completed */}
        {(displayGradingStatus.status === 'completed' || (stats.total > 0 && stats.graded === stats.total)) && submissions.length > 0 && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-surface-900">Grading complete</h3>
                <p className="text-sm text-surface-600">
                  All {stats.total} submissions graded
                  {stats.avgScore !== undefined && ` • Average score: ${stats.avgScore}%`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {/* Graded / Total */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Graded</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">{stats.graded}</span>
              <span className="text-xs text-surface-500">of {stats.total} submissions</span>
            </div>
            <div className="mt-3 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                style={{ width: `${stats.total > 0 ? (stats.graded / stats.total) * 100 : 0}%` }} 
              />
            </div>
          </div>

          {/* Average Score */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Average Score</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">
                {stats.avgScore !== undefined ? `${stats.avgScore}%` : '--'}
              </span>
              {stats.avgScore !== undefined && stats.avgScore >= 70 && (
                <span className="text-xs text-emerald-600">Passing</span>
              )}
            </div>
            <div className="mt-3 h-1.5 bg-surface-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  stats.avgScore && stats.avgScore >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${stats.avgScore || 0}%` }} 
              />
            </div>
          </div>

          {/* Processing */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Processing</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-surface-900">{stats.pending}</span>
              <span className="text-xs text-surface-500">{stats.pending > 0 ? 'In queue' : 'Complete'}</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-amber-600">
              {stats.pending > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
              <span className="text-xs">Processing</span>
            </div>
          </div>

          {/* Flagged for Review */}
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Flagged for Review</p>
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
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-surface-900">Student Submissions</h2>
              {regradeMode && (
                <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  Select submissions to re-grade
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {regradeMode && (
                <button
                  onClick={() => {
                    if (selectedForRegrade.size === submissions.length) {
                      setSelectedForRegrade(new Set());
                    } else {
                      setSelectedForRegrade(new Set(submissions.map(s => s.id)));
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded text-sm font-medium"
                >
                  {selectedForRegrade.size === submissions.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              <button className="flex items-center gap-2 px-3 py-1.5 text-surface-500 hover:text-surface-700 text-sm">
                <Filter className="w-4 h-4" />
                Filter
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  {/* Checkbox column for selective re-grade */}
                  {regradeMode && (
                    <th className="w-12 px-4 py-3">
                      <span className="sr-only">Select</span>
                    </th>
                  )}
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
                    Confidence
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubmissions.map((submission) => (
                  <tr 
                    key={submission.id} 
                    className={`border-b border-surface-100 hover:bg-surface-50 transition-colors ${
                      regradeMode && selectedForRegrade.has(submission.id) ? 'bg-amber-50' : ''
                    }`}
                  >
                    {/* Checkbox for selective re-grade */}
                    {regradeMode && (
                      <td className="w-12 px-4 py-4">
                        <button
                          onClick={() => toggleSubmissionForRegrade(submission.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedForRegrade.has(submission.id)
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'border-surface-300 hover:border-amber-400'
                          }`}
                        >
                          {selectedForRegrade.has(submission.id) && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium">
                          {getInitials(submission.studentName)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-surface-900">{submission.studentName}</p>
                            {submission.gradingCount != null && submission.gradingCount > 1 && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-violet-100 text-violet-700">
                                {ordinalGradingLabel(submission.gradingCount)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-surface-500">{getTimeAgo(submission.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-surface-700">
                      {submission.videoLength || '--'}
                    </td>
                    <td className="px-6 py-4">
                      {/* GRADING STATUS: Automated grading - system states only */}
                      {submission.hasGradeData && submission.overallScore != null ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-surface-900">
                            {Math.round(submission.overallScore)}/100
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            submission.overallScore >= 90 ? 'bg-emerald-100 text-emerald-700' :
                            submission.overallScore >= 70 ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {submission.overallScore >= 90 ? 'PASS' : 
                             submission.overallScore >= 70 ? 'GRADED' : 'FLAGGED'}
                          </span>
                        </div>
                      ) : submission.status === 'failed' ? (
                        <span className="text-amber-600 text-sm flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          Retrying
                        </span>
                      ) : submission.status === 'ready' && !submission.hasGradeData ? (
                        // System is finalizing - automated grading complete, awaiting score
                        <span className="text-primary-600 text-sm flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Finalizing
                        </span>
                      ) : ['transcribing', 'analyzing'].includes(submission.status) || (submission.status === 'queued' && gradingStarted) ? (
                        <span className="text-amber-600 text-sm flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Grading
                        </span>
                      ) : submission.status === 'queued' ? (
                        <span className="text-surface-400 text-sm">Queued</span>
                      ) : (
                        <span className="text-surface-400">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {/* Confidence - only shown when grade data is available */}
                      {submission.hasGradeData ? (
                        <div className="flex items-center gap-2">
                          {getSentimentIcon(submission.aiSentiment)}
                          <span className={getSentimentColor(submission.aiSentiment)}>
                            {submission.aiSentiment || '--'}
                          </span>
                        </div>
                      ) : submission.status === 'queued' && gradingStarted ? (
                        <span className="text-amber-600 text-sm">Grading...</span>
                      ) : submission.status === 'queued' ? (
                        <span className="text-surface-400 text-sm">Queued</span>
                      ) : ['transcribing', 'analyzing'].includes(submission.status) ? (
                        <span className="text-amber-600 text-sm">Analyzing...</span>
                      ) : submission.status === 'ready' && !submission.hasGradeData ? (
                        <span className="text-primary-600 text-sm">Finalizing...</span>
                      ) : submission.status === 'failed' ? (
                        <span className="text-amber-600 text-sm">Retrying...</span>
                      ) : (
                        <span className="text-surface-400">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Actions: System-owned states for automated grading */}
                        {submission.hasGradeData && !submissionIdsRegrading.has(submission.id) ? (
                          <Link
                            href={`/bulk/submission/${submission.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Link>
                        ) : submissionIdsRegrading.has(submission.id) && !submission.hasGradeData ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-surface-500 cursor-not-allowed" title="Re-grading in progress">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Re-grading…
                          </span>
                        ) : submission.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-600">
                            <RefreshCw className="w-4 h-4" />
                            Retrying
                          </span>
                        ) : submission.status === 'ready' && !submission.hasGradeData ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Finalizing
                          </span>
                        ) : submission.flagged ? (
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                            <Flag className="w-4 h-4" />
                            Audit
                          </button>
                        ) : ['transcribing', 'analyzing'].includes(submission.status) || (submission.status === 'queued' && gradingStarted) ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Grading
                          </span>
                        ) : submission.status === 'queued' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-surface-500">
                            <Clock className="w-4 h-4" />
                            Queued
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
