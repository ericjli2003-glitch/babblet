'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Trash2, Download, CheckCircle, XCircle, Clock, Loader2,
  FileVideo, FileAudio, ArrowLeft, AlertTriangle, X, Play, BookOpen,
  GraduationCap, Eye, FileText
} from 'lucide-react';
import Link from 'next/link';

// ============================================
// Configuration
// ============================================

const MAX_UPLOAD_CONCURRENCY = 3;
const POLL_INTERVAL_MS = 3000;
const ESTIMATED_TRANSCRIPTION_TIME_MS = 45000;
const ESTIMATED_ANALYSIS_TIME_MS = 30000;

// ============================================
// Types
// ============================================

type PipelineStage =
  | 'pending'
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'analyzing'
  | 'complete'
  | 'failed';

interface PipelineFile {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  studentName: string;
  localFile?: File;
  uploadProgress: number;
  uploadSpeed: number;
  bytesUploaded: number;
  stage: PipelineStage;
  errorMessage?: string;
  addedAt: number;
  uploadStartedAt?: number;
  uploadCompletedAt?: number;
  processingStartedAt?: number;
  completedAt?: number;
  overallScore?: number;
  submissionId?: string;
  abortController?: AbortController;
}

interface ClassContext {
  courseId: string;
  courseName: string;
  courseCode: string;
  term: string;
  assignmentId: string;
  assignmentName: string;
  batchId: string;
  batchName: string;
  bundleVersionId?: string;
  hasRubric: boolean;
  hasPrompt: boolean;
  hasMaterials: boolean;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.ceil(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.ceil((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getStageInfo(stage: PipelineStage): { label: string; color: string; icon: typeof Loader2 } {
  switch (stage) {
    case 'pending': return { label: 'Ready', color: 'text-surface-500', icon: Clock };
    case 'uploading': return { label: 'Uploading', color: 'text-blue-600', icon: Loader2 };
    case 'queued': return { label: 'Queued', color: 'text-amber-600', icon: Clock };
    case 'transcribing': return { label: 'Transcribing', color: 'text-violet-600', icon: Loader2 };
    case 'analyzing': return { label: 'Analyzing', color: 'text-teal-600', icon: Loader2 };
    case 'complete': return { label: 'Complete', color: 'text-emerald-600', icon: CheckCircle };
    case 'failed': return { label: 'Failed', color: 'text-red-600', icon: XCircle };
  }
}

// ============================================
// Main Component
// ============================================

export default function ClassBatchPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const assignmentId = params.assignmentId as string;
  const batchId = params.batchId as string;

  // State
  const [classContext, setClassContext] = useState<ClassContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortAllRef = useRef<boolean>(false);

  // ============================================
  // Load Class Context
  // ============================================

  useEffect(() => {
    const loadContext = async () => {
      try {
        setLoading(true);

        // Fetch course, assignment, and batch info in parallel
        const [courseRes, assignmentRes, batchRes] = await Promise.all([
          fetch(`/api/context/courses?id=${courseId}`),
          fetch(`/api/context/assignments?id=${assignmentId}`),
          fetch(`/api/bulk/status?batchId=${batchId}`),
        ]);

        const [courseData, assignmentData, batchData] = await Promise.all([
          courseRes.json(),
          assignmentRes.json(),
          batchRes.json(),
        ]);

        if (!courseData.success || !assignmentData.success) {
          setError('Failed to load class context');
          return;
        }

        const course = courseData.course;
        const assignment = assignmentData.assignment;
        const batch = batchData.batch;
        const latestVersion = assignmentData.latestVersion;

        setClassContext({
          courseId: course.id,
          courseName: course.name,
          courseCode: course.courseCode || '',
          term: course.term || '',
          assignmentId: assignment.id,
          assignmentName: assignment.name,
          batchId: batch?.id || batchId,
          batchName: batch?.name || 'New Batch',
          bundleVersionId: latestVersion?.id || batch?.bundleVersionId,
          hasRubric: !!assignment.rubricId,
          hasPrompt: !!(assignment.instructions && assignment.instructions.trim()),
          hasMaterials: true,
        });

        // Load existing submissions for this batch
        if (batchData.submissions) {
          const existingFiles: PipelineFile[] = batchData.submissions.map((sub: any) => ({
            id: sub.id,
            filename: sub.originalFilename || 'Unknown',
            fileSize: 0,
            fileType: 'video/mp4',
            studentName: sub.studentName || 'Unknown',
            uploadProgress: 100,
            uploadSpeed: 0,
            bytesUploaded: 0,
            stage: sub.status === 'complete' ? 'complete' :
                   sub.status === 'failed' ? 'failed' :
                   sub.status === 'analyzing' ? 'analyzing' :
                   sub.status === 'transcribing' ? 'transcribing' :
                   sub.status === 'queued' ? 'queued' : 'pending',
            addedAt: sub.createdAt || Date.now(),
            completedAt: sub.completedAt,
            overallScore: sub.rubricEvaluation?.overallScore,
            submissionId: sub.id,
          }));
          setPipeline(existingFiles);
        }

      } catch (err) {
        console.error('[ClassBatch] Failed to load context:', err);
        setError('Failed to load batch');
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [courseId, assignmentId, batchId]);

  // ============================================
  // Polling for Status Updates
  // ============================================

  useEffect(() => {
    if (!batchId || pipeline.length === 0) return;

    const hasActiveWork = pipeline.some(f =>
      ['uploading', 'queued', 'transcribing', 'analyzing'].includes(f.stage)
    );

    if (!hasActiveWork) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
        const data = await res.json();

        if (data.submissions) {
          setPipeline(prev => prev.map(file => {
            const serverSub = data.submissions.find((s: any) => s.id === file.submissionId);
            if (!serverSub) return file;

            const newStage: PipelineStage =
              serverSub.status === 'complete' ? 'complete' :
              serverSub.status === 'failed' ? 'failed' :
              serverSub.status === 'analyzing' ? 'analyzing' :
              serverSub.status === 'transcribing' ? 'transcribing' :
              serverSub.status === 'queued' ? 'queued' : file.stage;

            return {
              ...file,
              stage: newStage,
              overallScore: serverSub.rubricEvaluation?.overallScore,
              completedAt: serverSub.completedAt,
              errorMessage: serverSub.error,
            };
          }));
        }
      } catch (err) {
        console.error('[ClassBatch] Polling error:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [batchId, pipeline]);

  // ============================================
  // Derived Stats
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

    return { total, pending, uploading, queued, transcribing, analyzing, complete, failed, processing };
  }, [pipeline]);

  // ============================================
  // File Handling
  // ============================================

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;

    const newFiles: PipelineFile[] = Array.from(files).map(file => ({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: file.name,
      fileSize: file.size,
      fileType: file.type,
      studentName: inferStudentName(file.name),
      localFile: file,
      uploadProgress: 0,
      uploadSpeed: 0,
      bytesUploaded: 0,
      stage: 'pending' as PipelineStage,
      addedAt: Date.now(),
    }));

    setPipeline(prev => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  const removeFile = useCallback((id: string) => {
    setPipeline(prev => prev.filter(f => f.id !== id));
  }, []);

  const updateStudentName = useCallback((id: string, name: string) => {
    setPipeline(prev => prev.map(f =>
      f.id === id ? { ...f, studentName: name } : f
    ));
  }, []);

  // ============================================
  // Upload & Process
  // ============================================

  const uploadAndProcess = async () => {
    const pendingFiles = pipeline.filter(f => f.stage === 'pending' && f.localFile);
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);
    abortAllRef.current = false;

    // Upload with concurrency control
    let activeUploads = 0;
    let uploadIndex = 0;

    const uploadNext = async (): Promise<void> => {
      if (abortAllRef.current) return;
      if (uploadIndex >= pendingFiles.length) return;

      const file = pendingFiles[uploadIndex++];
      activeUploads++;

      try {
        // Get presigned URL
        const presignRes = await fetch('/api/bulk/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            filename: file.filename,
            contentType: file.fileType,
          }),
        });

        const presignData = await presignRes.json();
        if (!presignData.success) throw new Error(presignData.error);

        // Update to uploading
        setPipeline(prev => prev.map(f =>
          f.id === file.id ? { ...f, stage: 'uploading', uploadStartedAt: Date.now() } : f
        ));

        // Upload file
        const xhr = new XMLHttpRequest();
        const abortController = new AbortController();

        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const progress = (e.loaded / e.total) * 100;
              setPipeline(prev => prev.map(f =>
                f.id === file.id ? { ...f, uploadProgress: progress, bytesUploaded: e.loaded } : f
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };

          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.open('PUT', presignData.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.fileType);
          xhr.send(file.localFile);
        });

        // Enqueue for processing
        await fetch('/api/bulk/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            submissionId: presignData.submissionId,
            fileKey: presignData.fileKey,
            originalFilename: file.filename,
            studentName: file.studentName,
            bundleVersionId: classContext?.bundleVersionId,
          }),
        });

        setPipeline(prev => prev.map(f =>
          f.id === file.id ? {
            ...f,
            stage: 'queued',
            uploadProgress: 100,
            uploadCompletedAt: Date.now(),
            submissionId: presignData.submissionId,
          } : f
        ));

      } catch (err) {
        console.error('[ClassBatch] Upload error:', err);
        setPipeline(prev => prev.map(f =>
          f.id === file.id ? { ...f, stage: 'failed', errorMessage: err instanceof Error ? err.message : 'Upload failed' } : f
        ));
      } finally {
        activeUploads--;
        if (!abortAllRef.current && uploadIndex < pendingFiles.length) {
          uploadNext();
        }
      }
    };

    // Start concurrent uploads
    const initialBatch = Math.min(MAX_UPLOAD_CONCURRENCY, pendingFiles.length);
    for (let i = 0; i < initialBatch; i++) {
      uploadNext();
    }

    // Wait for all uploads
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (activeUploads === 0 || abortAllRef.current) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });

    // Trigger processing
    try {
      await fetch(`/api/bulk/process-now?batchId=${batchId}`, { method: 'POST' });
    } catch (err) {
      console.error('[ClassBatch] Failed to trigger processing:', err);
    }

    setIsProcessing(false);
  };

  const cancelAll = () => {
    abortAllRef.current = true;
    setIsProcessing(false);
  };

  // ============================================
  // Export
  // ============================================

  const exportCsv = () => {
    window.open(`/api/bulk/export?batchId=${batchId}`, '_blank');
  };

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-surface-50 to-cyan-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !classContext) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-surface-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-surface-700">{error || 'Failed to load batch'}</p>
          <Link href={`/context?courseId=${courseId}`} className="mt-4 inline-block text-teal-600 hover:underline">
            ← Back to Class Notebook
          </Link>
        </div>
      </div>
    );
  }

  const pendingFiles = pipeline.filter(f => f.stage === 'pending');
  const hasActiveWork = stats.processing > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-surface-50 to-cyan-50">
      {/* Class Context Header */}
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">{classContext.courseName}</span>
                  {classContext.courseCode && (
                    <span className="text-teal-200">({classContext.courseCode})</span>
                  )}
                  {classContext.term && (
                    <span className="text-teal-200">· {classContext.term}</span>
                  )}
                </div>
                <div className="text-teal-100">{classContext.assignmentName}</div>
                <div className="text-teal-200 text-sm">Batch: {classContext.batchName}</div>
              </div>
            </div>

            {/* Context Indicators */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className={`flex items-center gap-1 ${classContext.hasRubric ? 'text-white' : 'text-teal-300'}`}>
                  {classContext.hasRubric ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Rubric
                </span>
                <span className={`flex items-center gap-1 ${classContext.hasPrompt ? 'text-white' : 'text-teal-300'}`}>
                  {classContext.hasPrompt ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  Prompt
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

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-teal-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link
                href={`/context?courseId=${courseId}&assignmentId=${assignmentId}`}
                className="flex items-center gap-2 text-teal-600 hover:text-teal-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Back to Assignment</span>
              </Link>
              <span className="text-surface-300">|</span>
              <Link
                href={`/context?courseId=${courseId}`}
                className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
              >
                Back to Class Notebook
              </Link>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {stats.complete > 0 && (
                <button
                  onClick={exportCsv}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Bar */}
        {stats.total > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-surface-900">{stats.total}</div>
                  <div className="text-xs text-surface-500">Total</div>
                </div>
                {stats.processing > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
                    <div className="text-xs text-surface-500">Processing</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">{stats.complete}</div>
                  <div className="text-xs text-surface-500">Complete</div>
                </div>
                {stats.failed > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-xs text-surface-500">Failed</div>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-48">
                <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${stats.total > 0 ? (stats.complete / stats.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-xs text-surface-500 text-right mt-1">
                  {stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0}% complete
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6 mb-6">
          {/* Context Reminder */}
          <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <p className="text-sm text-teal-800">
              Submissions will be graded using the rubric and materials from <strong>{classContext.assignmentName}</strong>.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-teal-300 rounded-xl p-8 text-center cursor-pointer hover:border-teal-500 hover:bg-teal-50/50 transition-colors"
          >
            <BookOpen className="w-12 h-12 text-teal-400 mx-auto mb-4" />
            <p className="text-teal-700 font-medium">
              {pipeline.length === 0
                ? 'Upload submissions for this batch'
                : 'Add more submissions'}
            </p>
            <p className="text-sm text-teal-600 mt-1">Drag & drop or click to browse</p>
            <p className="text-xs text-surface-400 mt-2">MP4, MOV, WebM, MP3, WAV</p>
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

        {/* File List */}
        {pipeline.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-surface-900">Submissions</h3>
              {pendingFiles.length > 0 && (
                <div className="flex items-center gap-2">
                  {isProcessing ? (
                    <button
                      onClick={cancelAll}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={uploadAndProcess}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      Upload & Process ({pendingFiles.length})
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {pipeline.map(file => {
                const stageInfo = getStageInfo(file.stage);
                const isClickable = file.stage === 'complete' && file.submissionId;

                const content = (
                  <div
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                      file.stage === 'failed' ? 'bg-red-50 border-red-200' :
                      file.stage === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                      ['uploading', 'transcribing', 'analyzing'].includes(file.stage)
                        ? 'bg-teal-50 border-teal-200' :
                      'bg-surface-50 border-surface-200'
                    } ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
                  >
                    {file.fileType.startsWith('video') ? (
                      <FileVideo className="w-10 h-10 text-teal-500 flex-shrink-0" />
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

                      {/* Progress bar */}
                      {file.stage === 'uploading' && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 transition-all duration-300"
                              style={{ width: `${file.uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 ${stageInfo.color}`}>
                        {['uploading', 'transcribing', 'analyzing'].includes(file.stage) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <stageInfo.icon className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">{stageInfo.label}</span>
                      </div>

                      {file.stage === 'pending' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                          className="p-1.5 text-surface-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {isClickable && (
                        <Play className="w-5 h-5 text-emerald-500" />
                      )}
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
        {pipeline.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-teal-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-surface-700 mb-2">Ready for submissions</h3>
            <p className="text-surface-500 max-w-md mx-auto">
              Upload student presentation videos to grade them using the rubric and materials
              from this class.
            </p>
          </div>
        )}
      </main>

      {/* Context Panel */}
      <AnimatePresence>
        {showContextPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50"
              onClick={() => setShowContextPanel(false)}
            />
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
                <div className="bg-teal-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-2">Course</h3>
                  <p className="font-semibold text-teal-900">{classContext.courseName}</p>
                  {classContext.courseCode && <p className="text-sm text-teal-700">{classContext.courseCode}</p>}
                  {classContext.term && <p className="text-sm text-teal-600">{classContext.term}</p>}
                </div>

                <div className="bg-surface-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-600 uppercase tracking-wider mb-2">Assignment</h3>
                  <p className="font-semibold text-surface-900">{classContext.assignmentName}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-surface-600 uppercase tracking-wider">Context Attached</h3>
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${classContext.hasRubric ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classContext.hasRubric ? 'bg-emerald-200' : 'bg-amber-200'}`}>
                      {classContext.hasRubric ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div>
                      <p className={`font-medium ${classContext.hasRubric ? 'text-emerald-900' : 'text-amber-900'}`}>Grading Rubric</p>
                      <p className={`text-xs ${classContext.hasRubric ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {classContext.hasRubric ? 'Attached' : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${classContext.hasPrompt ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${classContext.hasPrompt ? 'bg-emerald-200' : 'bg-amber-200'}`}>
                      {classContext.hasPrompt ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div>
                      <p className={`font-medium ${classContext.hasPrompt ? 'text-emerald-900' : 'text-amber-900'}`}>Assignment Instructions</p>
                      <p className={`text-xs ${classContext.hasPrompt ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {classContext.hasPrompt ? 'Attached' : 'Not configured'}
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/context?courseId=${courseId}&assignmentId=${assignmentId}`}
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

