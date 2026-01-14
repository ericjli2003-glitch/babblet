'use client';

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FolderOpen, Plus, Trash2, Download,
  CheckCircle, XCircle, Clock, Loader2, FileVideo, FileAudio,
  ChevronRight, ArrowLeft, Users, AlertTriangle, X, Play, BookOpen,
  GraduationCap, FileText, Eye
} from 'lucide-react';
import Link from 'next/link';

// ============================================
// Configuration
// ============================================

const MAX_UPLOAD_CONCURRENCY = 3;
const POLL_INTERVAL_MS = 2000; // Poll every 2s for faster updates
const ESTIMATED_TRANSCRIPTION_TIME_MS = 45000; // ~45s per file
const ESTIMATED_ANALYSIS_TIME_MS = 30000; // ~30s per file

// ============================================
// Unified Pipeline Types
// ============================================

type PipelineStage =
  | 'pending'       // File selected, not yet started
  | 'uploading'     // Currently uploading to R2
  | 'queued'        // Uploaded, waiting in queue
  | 'transcribing'  // Being transcribed by Deepgram
  | 'analyzing'     // Being analyzed by Babblet AI
  | 'complete'      // Fully processed
  | 'failed';       // Error at any stage

interface PipelineFile {
  id: string;
  // File info
  filename: string;
  fileSize: number;
  fileType: string;
  studentName: string;
  // Local file (only present before upload completes)
  localFile?: File;
  // Upload progress
  uploadProgress: number;
  uploadSpeed: number;
  bytesUploaded: number;
  // Pipeline state
  stage: PipelineStage;
  errorMessage?: string;
  // Timing
  addedAt: number;
  uploadStartedAt?: number;
  uploadCompletedAt?: number;
  processingStartedAt?: number;
  completedAt?: number;
  // Result (after processing)
  overallScore?: number;
  submissionId?: string;
  // Upload control
  abortController?: AbortController;
}

interface BatchSummary {
  id: string;
  name: string;
  courseName?: string;
  assignmentName?: string;
  // Context references
  courseId?: string;
  assignmentId?: string;
  bundleVersionId?: string;
  // Stats
  totalSubmissions: number;
  processedCount: number;
  failedCount: number;
  status: string;
  createdAt: number;
}

// ============================================
// Helper Functions
// ============================================

function inferStudentName(filename: string): string {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = nameWithoutExt
    .replace(/[-_](presentation|video|recording|submission|final|v\d+)$/i, '')
    .replace(/[-_]\d{4,}$/, '');
  const spaced = cleaned.replace(/[-_]/g, ' ');
  const titleCased = spaced
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return titleCased || nameWithoutExt;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 0 || !isFinite(ms)) return '--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStageInfo(stage: PipelineStage): { icon: React.ReactNode; label: string; color: string } {
  switch (stage) {
    case 'pending':
      return { icon: <Clock className="w-4 h-4" />, label: 'Pending', color: 'text-surface-400' };
    case 'uploading':
      return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Uploading', color: 'text-blue-500' };
    case 'queued':
      return { icon: <Clock className="w-4 h-4" />, label: 'Queued', color: 'text-amber-500' };
    case 'transcribing':
      return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Transcribing', color: 'text-purple-500' };
    case 'analyzing':
      return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Analyzing', color: 'text-indigo-500' };
    case 'complete':
      return { icon: <CheckCircle className="w-4 h-4" />, label: 'Complete', color: 'text-emerald-500' };
    case 'failed':
      return { icon: <XCircle className="w-4 h-4" />, label: 'Failed', color: 'text-red-500' };
  }
}

// Map server status to pipeline stage
function serverStatusToStage(status: string): PipelineStage {
  switch (status) {
    case 'queued': return 'queued';
    case 'uploading': return 'uploading';
    case 'transcribing': return 'transcribing';
    case 'analyzing': return 'analyzing';
    case 'ready': return 'complete';
    case 'failed': return 'failed';
    default: return 'queued';
  }
}

// ============================================
// Main Component (with Suspense wrapper for useSearchParams)
// ============================================

export default function BulkUploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>}>
      <BulkUploadPageContent />
    </Suspense>
  );
}

// ============================================
// Class-Scoped Context Info
// ============================================

interface ClassScopedInfo {
  isClassScoped: boolean;
  courseId: string;
  courseName: string;
  courseCode: string;
  term: string;
  assignmentId: string;
  assignmentName: string;
  hasRubric: boolean;
  hasPrompt: boolean;
  hasMaterials: boolean;
  bundleVersionId?: string;
}

function BulkUploadPageContent() {
  const searchParams = useSearchParams();
  const urlCourseId = searchParams.get('courseId');
  const urlAssignmentId = searchParams.get('assignmentId');

  // Class-scoped state
  const [classScopedInfo, setClassScopedInfo] = useState<ClassScopedInfo | null>(null);
  const [loadingClassContext, setLoadingClassContext] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);

  // Determine if this is a class-scoped upload
  const isClassScoped = !!(urlCourseId && urlAssignmentId) || !!classScopedInfo?.isClassScoped;

  // View state
  const [view, setView] = useState<'list' | 'create' | 'batch'>('list');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Batches
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  // Course filter for global view
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; name: string; courseCode?: string }>>([]);

  // Create batch form
  const [batchName, setBatchName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [assignmentName, setAssignmentName] = useState('');
  const [rubricCriteria, setRubricCriteria] = useState('');
  const [creating, setCreating] = useState(false);

  // Context selection
  interface ContextOption {
    versionId: string;
    bundleId: string;
    courseId: string;
    courseName: string;
    assignmentId: string;
    assignmentName: string;
    version: number;
  }
  interface ContextCourse { id: string; name: string; courseCode: string; term: string; }
  interface ContextAssignment { id: string; name: string; }
  interface ContextVersion { id: string; version: number; }

  const [availableContexts, setAvailableContexts] = useState<ContextOption[]>([]);
  const [selectedContextId, setSelectedContextId] = useState('');
  const [selectedContextVersion, setSelectedContextVersion] = useState<ContextVersion | null>(null);
  const [selectedContextCourse, setSelectedContextCourse] = useState<ContextCourse | null>(null);
  const [selectedContextAssignment, setSelectedContextAssignment] = useState<ContextAssignment | null>(null);

  // Unified pipeline state
  const [pipeline, setPipeline] = useState<PipelineFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<BatchSummary | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRegrading, setIsRegrading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortAllRef = useRef<boolean>(false);

  // ============================================
  // Derived Stats (Single Source of Truth)
  // ============================================

  const stats = useMemo(() => {
    const pending = pipeline.filter(f => f.stage === 'pending').length;
    const uploading = pipeline.filter(f => f.stage === 'uploading').length;
    const queued = pipeline.filter(f => f.stage === 'queued').length;
    const transcribing = pipeline.filter(f => f.stage === 'transcribing').length;
    const analyzing = pipeline.filter(f => f.stage === 'analyzing').length;
    const complete = pipeline.filter(f => f.stage === 'complete').length;
    const failed = pipeline.filter(f => f.stage === 'failed').length;

    const total = pipeline.length;
    const processing = uploading + queued + transcribing + analyzing;
    const inProgress = pending + processing;

    return {
      total, pending, uploading, queued, transcribing, analyzing,
      complete, failed, processing, inProgress
    };
  }, [pipeline]);

  // ============================================
  // End-to-End ETA Calculation
  // ============================================

  const calculateEndToEndETA = useCallback((): {
    eta: string;
    breakdown: { upload: number; queue: number; analysis: number }
  } => {
    const pending = pipeline.filter(f => f.stage === 'pending');
    const uploading = pipeline.filter(f => f.stage === 'uploading');
    const queued = pipeline.filter(f => f.stage === 'queued');
    const transcribing = pipeline.filter(f => f.stage === 'transcribing');
    const analyzing = pipeline.filter(f => f.stage === 'analyzing');

    // Estimate remaining upload time
    let uploadTimeMs = 0;
    const totalPendingBytes = pending.reduce((sum, f) => sum + f.fileSize, 0);
    const avgSpeed = uploading.length > 0
      ? uploading.reduce((sum, f) => sum + f.uploadSpeed, 0) / uploading.length
      : 2 * 1024 * 1024; // Default 2 MB/s

    if (avgSpeed > 0) {
      // Remaining bytes in current uploads
      const remainingUploadBytes = uploading.reduce((sum, f) => sum + (f.fileSize - f.bytesUploaded), 0);
      uploadTimeMs = ((remainingUploadBytes + totalPendingBytes) / avgSpeed) * 1000;
    }

    // Estimate processing time
    const filesToProcess = pending.length + uploading.length + queued.length + transcribing.length + analyzing.length;
    const alreadyInProcessing = transcribing.length + analyzing.length;

    // Processing happens sequentially (1-2 at a time based on our MAX_PROCESS_PER_REQUEST)
    const processingTimeMs = (filesToProcess - alreadyInProcessing) * (ESTIMATED_TRANSCRIPTION_TIME_MS + ESTIMATED_ANALYSIS_TIME_MS) / 2;
    // Currently processing items (remaining time)
    const currentProcessingTime = (transcribing.length * ESTIMATED_TRANSCRIPTION_TIME_MS / 2) +
      (analyzing.length * ESTIMATED_ANALYSIS_TIME_MS / 2);

    const totalMs = uploadTimeMs + processingTimeMs + currentProcessingTime;

    return {
      eta: totalMs > 0 ? formatDuration(totalMs) : '--',
      breakdown: {
        upload: Math.round(uploadTimeMs / 1000),
        queue: Math.round((processingTimeMs + currentProcessingTime) / 1000),
        analysis: 0, // Combined into queue for simplicity
      }
    };
  }, [pipeline]);

  // ============================================
  // Load Batches
  // ============================================

  // Load available class contexts
  const loadAvailableContexts = useCallback(async () => {
    try {
      const coursesRes = await fetch('/api/context/courses');
      const coursesData = await coursesRes.json();
      if (!coursesData.success) return;

      const contexts: ContextOption[] = [];

      for (const course of coursesData.courses || []) {
        const assignmentsRes = await fetch(`/api/context/assignments?courseId=${course.id}`);
        const assignmentsData = await assignmentsRes.json();
        if (!assignmentsData.success) continue;

        for (const assignment of assignmentsData.assignments || []) {
          // Check if this assignment has a bundle with a version
          const bundleRes = await fetch(`/api/context/bundles?assignmentId=${assignment.id}`);
          const bundleData = await bundleRes.json();
          if (bundleData.success && bundleData.latestVersion) {
            contexts.push({
              versionId: bundleData.latestVersion.id,
              bundleId: bundleData.bundle.id,
              courseId: course.id,
              courseName: `${course.courseCode} - ${course.name}`,
              assignmentId: assignment.id,
              assignmentName: assignment.name,
              version: bundleData.latestVersion.version,
            });
          }
        }
      }

      setAvailableContexts(contexts);
    } catch (error) {
      console.error('[Bulk] Failed to load contexts:', error);
    }
  }, []);

  const handleContextSelect = (versionId: string) => {
    setSelectedContextId(versionId);
    const ctx = availableContexts.find(c => c.versionId === versionId);
    if (ctx) {
      setSelectedContextVersion({ id: ctx.versionId, version: ctx.version });
      setSelectedContextCourse({
        id: ctx.courseId,
        name: ctx.courseName,
        courseCode: '',
        term: ''
      });
      setSelectedContextAssignment({ id: ctx.assignmentId, name: ctx.assignmentName });
      // Auto-fill form fields
      setCourseName(ctx.courseName);
      setAssignmentName(ctx.assignmentName);
    }
  };

  const clearSelectedContext = () => {
    setSelectedContextId('');
    setSelectedContextVersion(null);
    setSelectedContextCourse(null);
    setSelectedContextAssignment(null);
  };

  const loadBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      const res = await fetch('/api/bulk/batches');
      const data = await res.json();
      if (data.success) {
        const batchList = data.batches || [];
        setBatches(batchList);

        // Extract unique courses for filter dropdown
        const coursesMap = new Map<string, { id: string; name: string; courseCode?: string }>();
        batchList.forEach((b: BatchSummary) => {
          if (b.courseId && b.courseName) {
            coursesMap.set(b.courseId, {
              id: b.courseId,
              name: b.courseName,
            });
          }
        });
        setAvailableCourses(Array.from(coursesMap.values()));
      }
    } catch (error) {
      console.error('[Bulk] Failed to load batches:', error);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      loadBatches();
    }
    // Load contexts when entering create view
    if (view === 'create') {
      loadAvailableContexts();
    }
  }, [view, loadBatches, loadAvailableContexts]);

  // ============================================
  // Load Class Context from URL Params
  // ============================================

  useEffect(() => {
    const loadClassContext = async () => {
      if (!urlCourseId || !urlAssignmentId) return;

      try {
        setLoadingClassContext(true);

        // Fetch course info
        const courseRes = await fetch(`/api/context/courses?id=${urlCourseId}`);
        const courseData = await courseRes.json();

        // Fetch assignment info
        const assignmentRes = await fetch(`/api/context/assignments?id=${urlAssignmentId}`);
        const assignmentData = await assignmentRes.json();

        if (courseData.success && assignmentData.success) {
          const course = courseData.course;
          const assignment = assignmentData.assignment;
          const latestVersion = assignmentData.latestVersion;

          // Set class-scoped info
          setClassScopedInfo({
            isClassScoped: true,
            courseId: course.id,
            courseName: course.name,
            courseCode: course.courseCode || '',
            term: course.term || '',
            assignmentId: assignment.id,
            assignmentName: assignment.name,
            hasRubric: !!assignment.rubricId,
            hasPrompt: !!(assignment.instructions && assignment.instructions.trim()),
            hasMaterials: true, // Assume true for now
            bundleVersionId: latestVersion?.id,
          });

          // Pre-populate form fields
          setCourseName(course.name);
          setAssignmentName(assignment.name);
          setBatchName(`${assignment.name} - ${new Date().toLocaleDateString()}`);

          // Pre-select context
          if (latestVersion) {
            setSelectedContextVersion({ id: latestVersion.id, version: latestVersion.version });
            setSelectedContextCourse({
              id: course.id,
              name: course.name,
              courseCode: course.courseCode || '',
              term: course.term || ''
            });
            setSelectedContextAssignment({ id: assignment.id, name: assignment.name });
          }

          // Go directly to create view for class-scoped uploads
          setView('create');
        }
      } catch (error) {
        console.error('[Bulk] Failed to load class context:', error);
      } finally {
        setLoadingClassContext(false);
      }
    };

    loadClassContext();
  }, [urlCourseId, urlAssignmentId]);

  // ============================================
  // Create Batch
  // ============================================

  const createBatch = async () => {
    if (!batchName.trim()) return;

    try {
      setCreating(true);

      // Build request body with context if selected
      const requestBody: Record<string, unknown> = {
        name: batchName.trim(),
        courseName: courseName.trim() || undefined,
        assignmentName: assignmentName.trim() || undefined,
        rubricCriteria: rubricCriteria.trim() || undefined,
      };

      // Add context references if selected
      if (selectedContextVersion && selectedContextCourse && selectedContextAssignment) {
        requestBody.courseId = selectedContextCourse.id;
        requestBody.assignmentId = selectedContextAssignment.id;
        requestBody.bundleVersionId = selectedContextVersion.id;
      }

      const res = await fetch('/api/bulk/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedBatchId(data.batch.id);
        setCurrentBatch(data.batch);
        setPipeline([]);
        setView('batch');
        // Clear form
        setBatchName('');
        setCourseName('');
        setAssignmentName('');
        setRubricCriteria('');
        clearSelectedContext();
      }
    } catch (error) {
      console.error('[Bulk] Failed to create batch:', error);
    } finally {
      setCreating(false);
    }
  };

  // ============================================
  // Load Batch Details & Sync Pipeline
  // ============================================

  const syncPipelineWithServer = useCallback(async (batchId: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setInitialLoading(true);

      const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
      const data = await res.json();

      if (data.success) {
        setCurrentBatch(data.batch);

        // Merge server submissions with local pipeline state
        setPipeline(prev => {
          const serverSubmissions = data.submissions || [];
          const localPending = prev.filter(f => f.stage === 'pending' || f.stage === 'uploading');

          // Stage priority: higher = more advanced in pipeline
          const stagePriority: Record<PipelineStage, number> = {
            'pending': 0,
            'uploading': 1,
            'queued': 2,
            'transcribing': 3,
            'analyzing': 4,
            'complete': 5,
            'failed': 5, // Failed is also terminal
          };

          // Convert server submissions to pipeline format
          const serverFiles: PipelineFile[] = serverSubmissions.map((sub: {
            id: string;
            studentName: string;
            originalFilename: string;
            status: string;
            errorMessage?: string;
            overallScore?: number;
            createdAt: number;
            completedAt?: number;
          }) => {
            // Check if this file exists in local state
            const existing = prev.find(f => f.submissionId === sub.id || f.filename === sub.originalFilename);
            const serverStage = serverStatusToStage(sub.status);
            
            // Use the more advanced stage (don't let stale server data regress local state)
            const localPriority = existing ? stagePriority[existing.stage] : 0;
            const serverPriority = stagePriority[serverStage];
            const useLocalStage = existing && localPriority > serverPriority;

            return {
              id: existing?.id || sub.id,
              filename: sub.originalFilename,
              fileSize: existing?.fileSize || 0,
              fileType: existing?.fileType || 'video/mp4',
              studentName: sub.studentName,
              uploadProgress: 100,
              uploadSpeed: 0,
              bytesUploaded: existing?.fileSize || 0,
              // Prefer local stage if it's more advanced, otherwise use server
              stage: useLocalStage ? existing.stage : serverStage,
              errorMessage: sub.errorMessage,
              addedAt: sub.createdAt,
              completedAt: sub.completedAt,
              // Use server score if available, otherwise keep local
              overallScore: sub.overallScore ?? existing?.overallScore,
              submissionId: sub.id,
            };
          });

          // Combine: local pending/uploading files + server files (avoiding duplicates)
          const serverFilenames = new Set(serverFiles.map(f => f.filename));
          const uniqueLocal = localPending.filter(f => !serverFilenames.has(f.filename));

          return [...uniqueLocal, ...serverFiles];
        });
      }
    } catch (error) {
      console.error('[Bulk] Failed to sync pipeline:', error);
    } finally {
      if (!silent) setInitialLoading(false);
    }
  }, []);

  // Poll for updates when viewing a batch
  useEffect(() => {
    if (view === 'batch' && selectedBatchId) {
      syncPipelineWithServer(selectedBatchId);

      const interval = setInterval(() => {
        syncPipelineWithServer(selectedBatchId, { silent: true });
      }, POLL_INTERVAL_MS);

      return () => clearInterval(interval);
    }
  }, [view, selectedBatchId, syncPipelineWithServer]);

  // ============================================
  // File Selection
  // ============================================

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm'];
    const newFiles: PipelineFile[] = [];

    Array.from(files).forEach(file => {
      const isValid = validTypes.some(t => file.type.startsWith(t.split('/')[0]));
      if (isValid) {
        newFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          filename: file.name,
          fileSize: file.size,
          fileType: file.type,
          studentName: inferStudentName(file.name),
          localFile: file,
          uploadProgress: 0,
          uploadSpeed: 0,
          bytesUploaded: 0,
          stage: 'pending',
          addedAt: Date.now(),
        });
      }
    });

    setPipeline(prev => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  }, []);

  const removeFile = (id: string) => {
    setPipeline(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.abortController) {
        file.abortController.abort();
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const updateStudentName = (id: string, name: string) => {
    setPipeline(prev => prev.map(f => f.id === id ? { ...f, studentName: name } : f));
  };

  // ============================================
  // Single File Upload
  // ============================================

  const uploadSingleFile = async (file: PipelineFile): Promise<boolean> => {
    if (abortAllRef.current || !file.localFile) {
      return false;
    }

    const abortController = new AbortController();
    const startTime = Date.now();

    setPipeline(prev => prev.map(f =>
      f.id === file.id ? {
        ...f,
        stage: 'uploading',
        uploadStartedAt: startTime,
        abortController
      } : f
    ));

    try {
      // 1. Get presigned URL
      const presignRes = await fetch('/api/bulk/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          filename: file.filename,
          contentType: file.fileType,
        }),
        signal: abortController.signal,
      });
      const presignData = await presignRes.json();

      if (!presignData.success) {
        throw new Error(presignData.error || 'Failed to get upload URL');
      }

      // 2. Upload to R2 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            const elapsed = Date.now() - startTime;
            const speed = elapsed > 0 ? (e.loaded / elapsed) * 1000 : 0;

            setPipeline(prev => prev.map(f =>
              f.id === file.id ? {
                ...f,
                uploadProgress: Math.min(progress, 95),
                bytesUploaded: e.loaded,
                uploadSpeed: speed,
              } : f
            ));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
        abortController.signal.addEventListener('abort', () => xhr.abort());

        xhr.open('PUT', presignData.uploadUrl);
        xhr.setRequestHeader('Content-Type', file.fileType);
        xhr.send(file.localFile!);
      });

      // 3. Enqueue for processing
      const enqueueRes = await fetch('/api/bulk/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          submissionId: presignData.submissionId,
          fileKey: presignData.fileKey,
          originalFilename: file.filename,
          fileSize: file.fileSize,
          mimeType: file.fileType,
          studentName: file.studentName,
        }),
        signal: abortController.signal,
      });

      if (!enqueueRes.ok) {
        throw new Error('Failed to enqueue');
      }

      setPipeline(prev => prev.map(f =>
        f.id === file.id ? {
          ...f,
          stage: 'queued',
          uploadProgress: 100,
          uploadCompletedAt: Date.now(),
          submissionId: presignData.submissionId,
          localFile: undefined, // Clear local file reference
        } : f
      ));

      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      if (errorMessage === 'Upload cancelled' || abortController.signal.aborted) {
        setPipeline(prev => prev.filter(f => f.id !== file.id));
        return false;
      }

      setPipeline(prev => prev.map(f =>
        f.id === file.id ? { ...f, stage: 'failed', errorMessage } : f
      ));

      return false;
    }
  };

  // ============================================
  // Re-grade All Submissions
  // ============================================

  const regradeAll = async () => {
    if (!selectedBatchId || !currentBatch?.bundleVersionId) {
      alert('This batch does not have a context version. Set up class context first.');
      return;
    }

    const completedSubmissions = pipeline.filter(f => f.stage === 'complete' && f.submissionId);
    if (completedSubmissions.length === 0) {
      alert('No completed submissions to re-grade.');
      return;
    }

    if (!confirm(`Re-grade ${completedSubmissions.length} submission(s) with the current context version?`)) {
      return;
    }

    try {
      setIsRegrading(true);

      const submissionIds = completedSubmissions.map(f => f.submissionId).filter(Boolean);

      const res = await fetch('/api/bulk/regrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionIds,
          bundleVersionId: currentBatch.bundleVersionId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Trigger processing
        await fetch(`/api/bulk/process-now?batchId=${selectedBatchId}`, { method: 'POST' });

        // Reset pipeline state for re-graded items
        setPipeline(prev => prev.map(f => {
          if (f.stage === 'complete' && f.submissionId && submissionIds.includes(f.submissionId)) {
            return { ...f, stage: 'queued' as const, overallScore: undefined };
          }
          return f;
        }));

        alert(`${data.results?.filter((r: { success: boolean }) => r.success).length || 0} submissions queued for re-grading.`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Re-grade failed:', error);
      alert('Re-grade failed. Please try again.');
    } finally {
      setIsRegrading(false);
    }
  };

  // ============================================
  // Start Processing Pipeline
  // ============================================

  const startPipeline = async () => {
    if (!selectedBatchId) return;

    const pendingFiles = pipeline.filter(f => f.stage === 'pending' && f.localFile);
    if (pendingFiles.length === 0) {
      // No files to upload, just trigger processing
      triggerProcessing();
      return;
    }

    setIsProcessing(true);
    abortAllRef.current = false;

    // Upload files with concurrency limit
    const executing: Promise<void>[] = [];

    for (const file of pendingFiles) {
      if (abortAllRef.current) break;

      const p = uploadSingleFile(file).then(() => { });
      executing.push(p);

      if (executing.length >= MAX_UPLOAD_CONCURRENCY) {
        await Promise.race(executing);
        // Clean up settled promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const settled = await Promise.race([
            executing[i].then(() => true).catch(() => true),
            Promise.resolve(false)
          ]);
          if (settled) executing.splice(i, 1);
        }
      }
    }

    await Promise.allSettled(executing);

    // Trigger server-side processing
    await triggerProcessing();

    setIsProcessing(false);
  };

  // ============================================
  // Trigger Server Processing
  // ============================================

  const triggerProcessing = async () => {
    try {
      const url = selectedBatchId
        ? `/api/bulk/process-now?batchId=${selectedBatchId}`
        : '/api/bulk/process-now';

      // Fire 3 parallel requests - each gets its own 300s timeout
      // This allows processing 3 videos simultaneously without timeout issues
      const PARALLEL_REQUESTS = 3;

      console.log(`[Bulk] Firing ${PARALLEL_REQUESTS} parallel processing requests...`);

      const results = await Promise.allSettled(
        Array(PARALLEL_REQUESTS).fill(null).map(() =>
          fetch(url, { method: 'POST' }).then(res => res.json())
        )
      );

      // Collect all successfully processed submission IDs
      const completedIds: string[] = [];
      
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          console.log(`[Bulk] Request ${i + 1} completed:`, result.value);
          // Extract processed IDs from response
          if (result.value?.processedIds) {
            completedIds.push(...result.value.processedIds);
          }
        } else {
          console.error(`[Bulk] Request ${i + 1} failed:`, result.reason);
        }
      });

      // Immediately update local pipeline state for completed submissions
      // This ensures UI updates even if server sync has stale data
      if (completedIds.length > 0) {
        console.log(`[Bulk] Marking ${completedIds.length} submissions as complete locally:`, completedIds);
        setPipeline(prev => prev.map(f => {
          if (f.submissionId && completedIds.includes(f.submissionId)) {
            return { ...f, stage: 'complete' as const };
          }
          return f;
        }));
      }

      // Also sync with server to get full details (scores, etc.)
      if (selectedBatchId) {
        // Delayed syncs to get full data after KV propagates
        setTimeout(() => syncPipelineWithServer(selectedBatchId, { silent: true }), 2000);
        setTimeout(() => syncPipelineWithServer(selectedBatchId, { silent: true }), 5000);
      }
    } catch (error) {
      console.error('[Bulk] Failed to trigger processing:', error);
    }
  };

  // ============================================
  // Cancel All
  // ============================================

  const cancelAll = () => {
    abortAllRef.current = true;
    setPipeline(prev => prev.map(f => {
      if (f.stage === 'uploading' && f.abortController) {
        f.abortController.abort();
      }
      if (f.stage === 'pending' || f.stage === 'uploading') {
        return { ...f, stage: 'failed' as PipelineStage, errorMessage: 'Cancelled' };
      }
      return f;
    }));
    setIsProcessing(false);
  };

  // ============================================
  // Delete Batch
  // ============================================

  const deleteBatch = async (batchId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Are you sure you want to delete this batch and all its submissions?')) return;

    try {
      await fetch(`/api/bulk/batches?id=${batchId}`, { method: 'DELETE' });
      loadBatches();
      if (selectedBatchId === batchId) {
        setView('list');
        setSelectedBatchId(null);
        setPipeline([]);
      }
    } catch (error) {
      console.error('[Bulk] Failed to delete batch:', error);
    }
  };

  // ============================================
  // Export CSV
  // ============================================

  const exportCsv = () => {
    if (!selectedBatchId) return;
    window.open(`/api/bulk/export?batchId=${selectedBatchId}`, '_blank');
  };

  // ============================================
  // Navigation Helpers
  // ============================================

  const goToBatchList = () => {
    setView('list');
    setSelectedBatchId(null);
    setPipeline([]);
    setCurrentBatch(null);
  };

  const openBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    setPipeline([]);
    setView('batch');
  };

  // ============================================
  // Render
  // ============================================

  const etaInfo = calculateEndToEndETA();
  const hasActiveWork = stats.inProgress > 0;
  const pendingFiles = pipeline.filter(f => f.stage === 'pending');

  // Accent colors based on scope
  const accentColor = isClassScoped ? 'teal' : 'primary';

  return (
    <div className={`min-h-screen ${isClassScoped
      ? 'bg-gradient-to-br from-teal-50 via-surface-50 to-cyan-50'
      : 'bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50'
      }`}>
      {/* Class Context Header - Persistent when class-scoped */}
      {isClassScoped && classScopedInfo && (
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{classScopedInfo.courseName}</span>
                    {classScopedInfo.courseCode && (
                      <span className="text-teal-200">({classScopedInfo.courseCode})</span>
                    )}
                    {classScopedInfo.term && (
                      <span className="text-teal-200">· {classScopedInfo.term}</span>
                    )}
                  </div>
                  <div className="text-teal-100 text-sm">
                    {classScopedInfo.assignmentName}
                  </div>
                </div>
                <span className="ml-2 px-2 py-0.5 bg-white/20 text-xs font-medium rounded-full">
                  Class-scoped upload
                </span>
              </div>

              {/* Context Status Indicators */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`flex items-center gap-1 ${classScopedInfo.hasRubric ? 'text-white' : 'text-teal-300'}`}>
                    {classScopedInfo.hasRubric ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    Rubric
                  </span>
                  <span className={`flex items-center gap-1 ${classScopedInfo.hasPrompt ? 'text-white' : 'text-teal-300'}`}>
                    {classScopedInfo.hasPrompt ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    Prompt
                  </span>
                  <span className={`flex items-center gap-1 ${classScopedInfo.hasMaterials ? 'text-white' : 'text-teal-300'}`}>
                    {classScopedInfo.hasMaterials ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    Materials
                  </span>
                </div>
                <button
                  onClick={() => setShowContextPanel(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View Context
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`sticky ${isClassScoped ? 'top-0' : 'top-0'} z-50 bg-white/90 backdrop-blur-lg border-b ${isClassScoped ? 'border-teal-200' : 'border-surface-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {/* Navigation - Different destinations based on scope */}
              {isClassScoped ? (
                view === 'batch' || view === 'create' ? (
                  <Link
                    href={`/context?courseId=${classScopedInfo?.courseId}&assignmentId=${classScopedInfo?.assignmentId}`}
                    className="flex items-center gap-2 text-teal-600 hover:text-teal-800 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="text-sm font-medium">Back to Assignment</span>
                  </Link>
                ) : (
                  <Link
                    href={`/context?courseId=${classScopedInfo?.courseId}`}
                    className="flex items-center gap-2 text-teal-600 hover:text-teal-800 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="text-sm font-medium">Back to Class Notebook</span>
                  </Link>
                )
              ) : view === 'batch' ? (
                <button
                  onClick={goToBatchList}
                  className="flex items-center gap-2 text-surface-600 hover:text-surface-900 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">Back to Batches</span>
                </button>
              ) : view === 'create' ? (
                <button
                  onClick={goToBatchList}
                  className="flex items-center gap-2 text-surface-600 hover:text-surface-900 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">Back to Batches</span>
                </button>
              ) : (
                <Link href="/" className="flex items-center gap-2 text-surface-600 hover:text-surface-900 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">Back to Dashboard</span>
                </Link>
              )}
              <div className={`h-6 w-px ${isClassScoped ? 'bg-teal-200' : 'bg-surface-200'}`} />

              {/* Title - Different based on scope */}
              {isClassScoped ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-teal-800">
                      Upload Submissions for {classScopedInfo?.assignmentName || 'Assignment'}
                    </h1>
                    <p className="text-xs text-teal-600">
                      Graded using class rubric and materials
                    </p>
                  </div>
                </div>
              ) : (
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">
                  Bulk Upload Submissions
                </h1>
              )}
            </div>

            {/* Header Actions */}
            {view === 'batch' && currentBatch && (
              <div className="flex items-center gap-2">
                <button
                  onClick={exportCsv}
                  disabled={stats.complete === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => deleteBatch(selectedBatchId!)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Batches List View */}
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  {isClassScoped && classScopedInfo ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-surface-900">
                          Batches for {classScopedInfo.assignmentName}
                        </h2>
                        <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-medium rounded-full flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" />
                          {classScopedInfo.courseName}
                        </span>
                      </div>
                      <p className="text-surface-600 mt-1">
                        Upload student presentations for this assignment
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-bold text-surface-900">Your Batches</h2>
                      <p className="text-surface-600 mt-1">Upload and process student presentation videos in bulk</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Course Filter - Only show on global view */}
                  {!isClassScoped && availableCourses.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-surface-600">Filter:</label>
                      <select
                        value={courseFilter}
                        onChange={(e) => setCourseFilter(e.target.value)}
                        className="px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">All Courses</option>
                        {availableCourses.map(course => (
                          <option key={course.id} value={course.id}>
                            {course.name}{course.courseCode ? ` (${course.courseCode})` : ''}
                          </option>
                        ))}
                      </select>
                      {courseFilter && (
                        <button
                          onClick={() => setCourseFilter('')}
                          className="p-1 text-surface-400 hover:text-surface-600"
                          title="Clear filter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setView('create')}
                    className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl transition-colors ${isClassScoped
                      ? 'bg-teal-600 hover:bg-teal-700'
                      : 'bg-primary-600 hover:bg-primary-700'
                      }`}
                  >
                    <Plus className="w-5 h-5" />
                    {isClassScoped ? 'New Batch for Assignment' : 'New Batch'}
                  </button>
                </div>
              </div>

              {/* Filtered batches */}
              {(() => {
                const filteredBatches = courseFilter
                  ? batches.filter(b => b.courseId === courseFilter)
                  : batches;

                return loadingBatches ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                  </div>
                ) : batches.length === 0 ? (
                  <div className={`bg-white rounded-2xl shadow-sm border p-12 text-center ${isClassScoped ? 'border-teal-200' : 'border-surface-200'}`}>
                    {isClassScoped && classScopedInfo ? (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
                          <GraduationCap className="w-8 h-8 text-teal-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-surface-900 mb-2">
                          No batches for {classScopedInfo.assignmentName}
                        </h3>
                        <p className="text-surface-600 mb-2">
                          Create a batch to start uploading student presentations for this assignment
                        </p>
                        <p className="text-sm text-teal-600 mb-6">
                          Context: {classScopedInfo.courseName} ({classScopedInfo.term})
                        </p>
                        <button
                          onClick={() => setView('create')}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                          Create Batch for Assignment
                        </button>
                      </>
                    ) : (
                      <>
                        <FolderOpen className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-surface-900 mb-2">No batches yet</h3>
                        <p className="text-surface-600 mb-6">Create your first batch to start uploading presentations</p>
                        <button
                          onClick={() => setView('create')}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                          Create Batch
                        </button>
                      </>
                    )}
                  </div>
                ) : filteredBatches.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
                    <FolderOpen className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-surface-900 mb-2">No batches for this course</h3>
                    <p className="text-surface-600 mb-6">No batches found for the selected course filter</p>
                    <button
                      onClick={() => setCourseFilter('')}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-surface-100 text-surface-700 rounded-xl hover:bg-surface-200 transition-colors"
                    >
                      Clear Filter
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredBatches.map(batch => (
                      <motion.div
                        key={batch.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => openBatch(batch.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-semibold text-surface-900">{batch.name}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${batch.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                batch.status === 'processing' ? 'bg-amber-100 text-amber-700' :
                                  'bg-surface-100 text-surface-700'
                                }`}>
                                {batch.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-surface-500">
                              {batch.courseName && <span>{batch.courseName}</span>}
                              {batch.assignmentName && <span>• {batch.assignmentName}</span>}
                              <span>• {formatDate(batch.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-surface-900">{batch.totalSubmissions}</div>
                              <div className="text-xs text-surface-500">Total</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-emerald-600">{batch.processedCount}</div>
                              <div className="text-xs text-surface-500">Complete</div>
                            </div>
                            <button
                              onClick={(e) => deleteBatch(batch.id, e)}
                              className="p-2 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete batch"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <ChevronRight className="w-5 h-5 text-surface-400" />
                          </div>
                        </div>
                        {batch.totalSubmissions > 0 && (
                          <div className="mt-3">
                            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                                style={{ width: `${(batch.processedCount / batch.totalSubmissions) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* Create Batch View */}
          {view === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className={`bg-white rounded-2xl shadow-sm border p-8 ${isClassScoped ? 'border-teal-200' : 'border-surface-200'}`}>
                <h2 className="text-2xl font-bold text-surface-900 mb-6">
                  {isClassScoped && classScopedInfo
                    ? `Create Batch for ${classScopedInfo.assignmentName}`
                    : 'Create New Batch'}
                </h2>

                <div className="space-y-6 max-w-xl">
                  {/* Context Selection Banner */}
                  {selectedContextVersion ? (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <BookOpen className="w-5 h-5 text-emerald-600" />
                          <div>
                            <p className="font-medium text-emerald-900">
                              Using Class Context v{selectedContextVersion.version}
                            </p>
                            <p className="text-sm text-emerald-700">
                              {selectedContextCourse?.name} • {selectedContextAssignment?.name}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={clearSelectedContext}
                          className="text-sm text-emerald-600 hover:text-emerald-700"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  ) : availableContexts.length > 0 ? (
                    <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-5 h-5 text-violet-600" />
                        <span className="font-medium text-violet-900">Select Class Context</span>
                      </div>
                      <select
                        value={selectedContextId}
                        onChange={(e) => handleContextSelect(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-violet-300 focus:ring-2 focus:ring-violet-500 text-sm"
                      >
                        <option value="">Choose a course & assignment...</option>
                        {availableContexts.map(ctx => (
                          <option key={ctx.versionId} value={ctx.versionId}>
                            {ctx.courseName} • {ctx.assignmentName} (v{ctx.version})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-violet-600 mt-2">
                        Using class context improves AI grading accuracy
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-amber-600" />
                        <div className="flex-1">
                          <p className="font-medium text-amber-900">No Class Context Set Up</p>
                          <p className="text-sm text-amber-700">
                            Set up rubrics and course materials for better AI grading
                          </p>
                        </div>
                        <Link
                          href="/context"
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
                        >
                          Set Up
                        </Link>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-2">
                      Batch Name *
                    </label>
                    <input
                      type="text"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="e.g., COMM 101 Final Presentations"
                      className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  {/* Show manual course/assignment fields only if no context selected */}
                  {!selectedContextVersion && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-2">
                          Course Name (optional)
                        </label>
                        <input
                          type="text"
                          value={courseName}
                          onChange={(e) => setCourseName(e.target.value)}
                          placeholder="e.g., COMM 101"
                          className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-2">
                          Assignment Name (optional)
                        </label>
                        <input
                          type="text"
                          value={assignmentName}
                          onChange={(e) => setAssignmentName(e.target.value)}
                          placeholder="e.g., Persuasive Speech"
                          className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-2">
                          Rubric Criteria (optional)
                        </label>
                        <textarea
                          value={rubricCriteria}
                          onChange={(e) => setRubricCriteria(e.target.value)}
                          placeholder="Paste your rubric criteria here..."
                          rows={4}
                          className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <p className="text-xs text-surface-500 mt-1">
                          Babblet will use this to generate more targeted feedback
                        </p>
                      </div>
                    </>
                  )}

                  <button
                    onClick={createBatch}
                    disabled={!batchName.trim() || creating}
                    className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Create Batch
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Batch Detail View */}
          {view === 'batch' && selectedBatchId && (
            <motion.div
              key="batch"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Batch Header */}
              {currentBatch && (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-surface-900">{currentBatch.name}</h2>
                      <div className="flex items-center gap-2 mt-1 text-sm text-surface-500">
                        {currentBatch.courseName && <span>{currentBatch.courseName}</span>}
                        {currentBatch.assignmentName && <span>• {currentBatch.assignmentName}</span>}
                      </div>
                      {/* Context Indicator */}
                      {currentBatch.bundleVersionId ? (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                            <BookOpen className="w-3 h-3" />
                            Using Class Context
                          </span>
                          <Link
                            href={`/context?courseId=${currentBatch.courseId}&assignmentId=${currentBatch.assignmentId}`}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            Edit Context →
                          </Link>
                        </div>
                      ) : (
                        <Link
                          href="/context"
                          className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 mt-2"
                        >
                          <BookOpen className="w-3 h-3" />
                          Set up Class Context for better grading →
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Stats Cards - Single Source of Truth */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-surface-50 rounded-xl p-4 text-center">
                      <Users className="w-6 h-6 text-surface-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-surface-900">{stats.total}</div>
                      <div className="text-xs text-surface-500">Total Files</div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 text-center">
                      <Clock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-amber-600">{stats.processing}</div>
                      <div className="text-xs text-surface-500">Processing</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4 text-center">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-emerald-600">{stats.complete}</div>
                      <div className="text-xs text-surface-500">Complete</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                      <div className="text-xs text-surface-500">Failed</div>
                    </div>
                  </div>

                  {/* End-to-End ETA */}
                  {hasActiveWork && (
                    <div className="mt-6 p-4 bg-primary-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-primary-700">
                          Time until results are ready
                        </span>
                        <span className="text-lg font-bold text-primary-600">
                          ~{etaInfo.eta}
                        </span>
                      </div>
                      <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-600 transition-all duration-500"
                          style={{ width: `${stats.total > 0 ? (stats.complete / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-primary-600 mt-1">
                        <span>{stats.complete} / {stats.total} complete</span>
                        <span>{Math.round((stats.complete / Math.max(stats.total, 1)) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Drop Zone */}
              <div className={`bg-white rounded-2xl shadow-sm border p-6 ${isClassScoped ? 'border-teal-200' : 'border-surface-200'}`}>
                {/* Class-scoped context reminder */}
                {isClassScoped && classScopedInfo && (
                  <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3">
                    <GraduationCap className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <p className="text-sm text-teal-800">
                      These submissions will be graded using the class rubric and materials from <strong>{classScopedInfo.assignmentName}</strong>.
                    </p>
                  </div>
                )}

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isClassScoped
                    ? 'border-teal-300 hover:border-teal-500 hover:bg-teal-50/50'
                    : 'border-surface-300 hover:border-primary-400 hover:bg-primary-50/50'
                    }`}
                >
                  {isClassScoped ? (
                    <BookOpen className="w-12 h-12 text-teal-400 mx-auto mb-4" />
                  ) : (
                    <Upload className="w-12 h-12 text-surface-400 mx-auto mb-4" />
                  )}
                  <p className={`font-medium ${isClassScoped ? 'text-teal-700' : 'text-surface-700'}`}>
                    Drag & drop video or audio files here
                  </p>
                  <p className={`text-sm mt-1 ${isClassScoped ? 'text-teal-600' : 'text-surface-500'}`}>or click to browse</p>
                  <p className="text-xs text-surface-400 mt-2">Supports MP4, MOV, WebM, MP3, WAV</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="video/*,audio/*"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Unified Pipeline View */}
              {pipeline.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-surface-900">
                      Files ({pipeline.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      {isProcessing && (
                        <button
                          onClick={cancelAll}
                          className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                      {(pendingFiles.length > 0 || stats.queued > 0) && !isProcessing && (
                        <button
                          onClick={startPipeline}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                        >
                          <Play className="w-4 h-4" />
                          {pendingFiles.length > 0 ? 'Upload & Process' : 'Process Now'}
                        </button>
                      )}

                      {/* Re-grade All Button */}
                      {currentBatch?.bundleVersionId && stats.complete > 0 && (
                        <button
                          onClick={regradeAll}
                          disabled={isRegrading}
                          className="flex items-center gap-2 px-3 py-2 text-violet-600 bg-violet-100 rounded-lg hover:bg-violet-200 text-sm disabled:opacity-50"
                        >
                          {isRegrading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                          )}
                          Re-grade All ({stats.complete})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* File List */}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {pipeline.map(file => {
                      const stageInfo = getStageInfo(file.stage);
                      const isClickable = file.stage === 'complete' && file.submissionId;

                      const content = (
                        <div
                          className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${file.stage === 'failed' ? 'bg-red-50 border-red-200' :
                            file.stage === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                              file.stage === 'uploading' || file.stage === 'transcribing' || file.stage === 'analyzing'
                                ? 'bg-blue-50 border-blue-200' :
                                'bg-surface-50 border-surface-200'
                            } ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
                        >
                          {file.fileType.startsWith('video') ? (
                            <FileVideo className="w-10 h-10 text-primary-500 flex-shrink-0" />
                          ) : (
                            <FileAudio className="w-10 h-10 text-violet-500 flex-shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-surface-900 truncate">{file.filename}</p>
                              {file.overallScore !== undefined && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                  {file.overallScore.toFixed(1)}/5
                                </span>
                              )}
                            </div>

                            {file.stage === 'pending' ? (
                              <input
                                type="text"
                                value={file.studentName}
                                onChange={(e) => updateStudentName(file.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-sm text-surface-600 bg-transparent border-none p-0 focus:ring-0"
                                placeholder="Student name"
                              />
                            ) : (
                              <p className="text-sm text-surface-500">{file.studentName}</p>
                            )}

                            {/* Progress bar for uploading */}
                            {file.stage === 'uploading' && (
                              <div className="mt-2">
                                <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${file.uploadProgress}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-xs text-surface-500 mt-0.5">
                                  <span>{file.uploadProgress}%</span>
                                  <span>{formatBytes(file.uploadSpeed)}/s</span>
                                </div>
                              </div>
                            )}

                            {file.errorMessage && (
                              <p className="text-xs text-red-600 mt-1">{file.errorMessage}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-surface-500">{formatBytes(file.fileSize)}</span>
                            <div className={`flex items-center gap-1.5 ${stageInfo.color}`}>
                              {stageInfo.icon}
                              <span className="text-sm font-medium">{stageInfo.label}</span>
                            </div>
                            {file.stage === 'pending' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                                className="p-1 text-surface-400 hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {isClickable && <ChevronRight className="w-4 h-4 text-surface-400" />}
                          </div>
                        </div>
                      );

                      return isClickable ? (
                        <Link key={file.id} href={`/bulk/submission/${file.submissionId}`}>
                          {content}
                        </Link>
                      ) : (
                        <div key={file.id}>{content}</div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!initialLoading && pipeline.length === 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
                  <FileVideo className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">No files yet</h3>
                  <p className="text-surface-600">Drag and drop files above to get started</p>
                </div>
              )}

              {initialLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Context Panel (Side Drawer) - Class-scoped only */}
      <AnimatePresence>
        {showContextPanel && isClassScoped && classScopedInfo && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50"
              onClick={() => setShowContextPanel(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-teal-600 to-cyan-600 text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GraduationCap className="w-6 h-6" />
                    <h2 className="text-lg font-semibold">Class Context</h2>
                  </div>
                  <button
                    onClick={() => setShowContextPanel(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-6">
                {/* Course Info */}
                <div className="bg-teal-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-2">Course</h3>
                  <p className="font-semibold text-teal-900">{classScopedInfo.courseName}</p>
                  {classScopedInfo.courseCode && (
                    <p className="text-sm text-teal-700">{classScopedInfo.courseCode}</p>
                  )}
                  {classScopedInfo.term && (
                    <p className="text-sm text-teal-600">{classScopedInfo.term}</p>
                  )}
                </div>

                {/* Assignment Info */}
                <div className="bg-surface-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-600 uppercase tracking-wider mb-2">Assignment</h3>
                  <p className="font-semibold text-surface-900">{classScopedInfo.assignmentName}</p>
                </div>

                {/* Context Status */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-surface-600 uppercase tracking-wider">Context Attached</h3>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${classScopedInfo.hasRubric ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classScopedInfo.hasRubric ? 'bg-emerald-200' : 'bg-amber-200'}`}>
                      {classScopedInfo.hasRubric ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div>
                      <p className={`font-medium ${classScopedInfo.hasRubric ? 'text-emerald-900' : 'text-amber-900'}`}>
                        Grading Rubric
                      </p>
                      <p className={`text-xs ${classScopedInfo.hasRubric ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {classScopedInfo.hasRubric ? 'Attached and ready' : 'Not configured'}
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${classScopedInfo.hasPrompt ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classScopedInfo.hasPrompt ? 'bg-emerald-200' : 'bg-amber-200'}`}>
                      {classScopedInfo.hasPrompt ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div>
                      <p className={`font-medium ${classScopedInfo.hasPrompt ? 'text-emerald-900' : 'text-amber-900'}`}>
                        Assignment Instructions
                      </p>
                      <p className={`text-xs ${classScopedInfo.hasPrompt ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {classScopedInfo.hasPrompt ? 'Attached and ready' : 'Not configured'}
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${classScopedInfo.hasMaterials ? 'bg-emerald-50' : 'bg-surface-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classScopedInfo.hasMaterials ? 'bg-emerald-200' : 'bg-surface-200'}`}>
                      {classScopedInfo.hasMaterials ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <FileText className="w-4 h-4 text-surface-400" />}
                    </div>
                    <div>
                      <p className={`font-medium ${classScopedInfo.hasMaterials ? 'text-emerald-900' : 'text-surface-700'}`}>
                        Class Materials
                      </p>
                      <p className={`text-xs ${classScopedInfo.hasMaterials ? 'text-emerald-600' : 'text-surface-500'}`}>
                        {classScopedInfo.hasMaterials ? 'Available for context' : 'None uploaded'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-sm text-teal-800">
                    <strong>How it works:</strong> Submissions uploaded here will be graded using the rubric
                    and context from this class. Babblet will reference class materials when providing feedback.
                  </p>
                </div>

                {/* Edit Context Link */}
                <Link
                  href={`/context?courseId=${classScopedInfo.courseId}&assignmentId=${classScopedInfo.assignmentId}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  Edit Class Context
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
