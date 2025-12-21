'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, FolderOpen, Plus, Trash2, Download, RefreshCw, 
  CheckCircle, XCircle, Clock, Loader2, FileVideo, FileAudio,
  ChevronRight, ArrowLeft, Users, BarChart3, AlertTriangle, X, Play
} from 'lucide-react';
import Link from 'next/link';

// ============================================
// Configuration
// ============================================

const MAX_UPLOAD_CONCURRENCY = 3;
const POLL_INTERVAL_MS = 5000;

// ============================================
// Types
// ============================================

type SubmissionStatus = 'queued' | 'uploading' | 'transcribing' | 'analyzing' | 'ready' | 'failed';

interface FileToUpload {
  file: File;
  id: string;
  studentName: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error' | 'cancelled';
  progress: number;
  bytesUploaded: number;
  uploadSpeed: number; // bytes per second
  error?: string;
  abortController?: AbortController;
  startTime?: number;
}

interface BatchSummary {
  id: string;
  name: string;
  courseName?: string;
  assignmentName?: string;
  totalSubmissions: number;
  processedCount: number;
  failedCount: number;
  status: string;
  createdAt: number;
}

interface SubmissionSummary {
  id: string;
  studentName: string;
  originalFilename: string;
  status: SubmissionStatus;
  errorMessage?: string;
  overallScore?: number;
  createdAt: number;
  completedAt?: number;
}

interface UploadStats {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  startTime: number;
  averageSpeed: number;
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
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `~${minutes}m ${remainingSeconds}s`;
  }
  return `~${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusIcon(status: SubmissionStatus) {
  switch (status) {
    case 'queued': return <Clock className="w-4 h-4 text-surface-400" />;
    case 'uploading': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'transcribing': return <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />;
    case 'analyzing': return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    case 'ready': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function getStatusLabel(status: SubmissionStatus) {
  switch (status) {
    case 'queued': return 'Queued';
    case 'uploading': return 'Uploading...';
    case 'transcribing': return 'Transcribing...';
    case 'analyzing': return 'Analyzing...';
    case 'ready': return 'Complete';
    case 'failed': return 'Failed';
  }
}

// ============================================
// Concurrency Pool
// ============================================

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = fn(item).then(result => {
      results.push(result);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove settled promises
      executing.splice(0, executing.length, 
        ...executing.filter(e => {
          let settled = false;
          e.then(() => { settled = true; }).catch(() => { settled = true; });
          return !settled;
        })
      );
    }
  }

  await Promise.all(executing);
  return results;
}

// ============================================
// Main Component
// ============================================

export default function BulkUploadPage() {
  // View state
  const [view, setView] = useState<'list' | 'create' | 'batch'>('list');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Batches
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  // Create batch form
  const [batchName, setBatchName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [assignmentName, setAssignmentName] = useState('');
  const [rubricCriteria, setRubricCriteria] = useState('');
  const [creating, setCreating] = useState(false);

  // File upload
  const [filesToUpload, setFilesToUpload] = useState<FileToUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortAllRef = useRef<boolean>(false);

  // Batch detail
  const [currentBatch, setCurrentBatch] = useState<BatchSummary | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // ============================================
  // Load Batches
  // ============================================

  const loadBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      const res = await fetch('/api/bulk/batches');
      const data = await res.json();
      if (data.success) {
        setBatches(data.batches || []);
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
  }, [view, loadBatches]);

  // ============================================
  // Create Batch
  // ============================================

  const createBatch = async () => {
    if (!batchName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch('/api/bulk/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName.trim(),
          courseName: courseName.trim() || undefined,
          assignmentName: assignmentName.trim() || undefined,
          rubricCriteria: rubricCriteria.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedBatchId(data.batch.id);
        setView('batch');
        setBatchName('');
        setCourseName('');
        setAssignmentName('');
        setRubricCriteria('');
      }
    } catch (error) {
      console.error('[Bulk] Failed to create batch:', error);
    } finally {
      setCreating(false);
    }
  };

  // ============================================
  // Load Batch Details (with silent refresh option)
  // ============================================

  const loadBatchDetails = useCallback(async (batchId: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoadingSubmissions(true);
      const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentBatch(data.batch);
        setSubmissions(data.submissions || []);
      }
    } catch (error) {
      console.error('[Bulk] Failed to load batch details:', error);
    } finally {
      if (!silent) setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'batch' && selectedBatchId) {
      loadBatchDetails(selectedBatchId);
      // Poll for updates silently
      const interval = setInterval(() => loadBatchDetails(selectedBatchId, { silent: true }), POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [view, selectedBatchId, loadBatchDetails]);

  // ============================================
  // File Selection
  // ============================================

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;

    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm'];
    const newFiles: FileToUpload[] = [];

    Array.from(files).forEach(file => {
      const isValid = validTypes.some(t => file.type.startsWith(t.split('/')[0]));
      if (isValid) {
        newFiles.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          studentName: inferStudentName(file.name),
          status: 'pending',
          progress: 0,
          bytesUploaded: 0,
          uploadSpeed: 0,
        });
      }
    });

    setFilesToUpload(prev => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  }, []);

  const removeFile = (id: string) => {
    setFilesToUpload(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.abortController) {
        file.abortController.abort();
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const updateStudentName = (id: string, name: string) => {
    setFilesToUpload(prev => prev.map(f => f.id === id ? { ...f, studentName: name } : f));
  };

  // ============================================
  // Single File Upload (with real progress)
  // ============================================

  const uploadSingleFile = async (fileData: FileToUpload): Promise<{ success: boolean; error?: string }> => {
    if (abortAllRef.current) {
      return { success: false, error: 'Cancelled' };
    }

    const abortController = new AbortController();
    const startTime = Date.now();

    // Update with abort controller
    setFilesToUpload(prev => prev.map(f => 
      f.id === fileData.id ? { ...f, status: 'uploading', progress: 0, abortController, startTime } : f
    ));

    try {
      console.log(`[Upload] Starting: ${fileData.file.name} (${formatBytes(fileData.file.size)})`);

      // 1. Get presigned URL
      const presignRes = await fetch('/api/bulk/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          filename: fileData.file.name,
          contentType: fileData.file.type,
        }),
        signal: abortController.signal,
      });
      const presignData = await presignRes.json();
      
      if (!presignData.success) {
        throw new Error(presignData.error || 'Failed to get upload URL');
      }

      // 2. Upload to R2 with progress tracking using XMLHttpRequest
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            const elapsed = Date.now() - startTime;
            const speed = elapsed > 0 ? (e.loaded / elapsed) * 1000 : 0;
            
            setFilesToUpload(prev => prev.map(f => 
              f.id === fileData.id ? { 
                ...f, 
                progress: Math.min(progress, 95), // Reserve last 5% for enqueue
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

        // Handle abort signal
        abortController.signal.addEventListener('abort', () => xhr.abort());

        xhr.open('PUT', presignData.uploadUrl);
        xhr.setRequestHeader('Content-Type', fileData.file.type);
        xhr.send(fileData.file);
      });

      // 3. Enqueue for processing
      const enqueueRes = await fetch('/api/bulk/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          submissionId: presignData.submissionId,
          fileKey: presignData.fileKey,
          originalFilename: fileData.file.name,
          fileSize: fileData.file.size,
          mimeType: fileData.file.type,
          studentName: fileData.studentName,
        }),
        signal: abortController.signal,
      });

      if (!enqueueRes.ok) {
        throw new Error('Failed to enqueue');
      }

      console.log(`[Upload] Complete: ${fileData.file.name}`);

      setFilesToUpload(prev => prev.map(f => 
        f.id === fileData.id ? { ...f, status: 'uploaded', progress: 100 } : f
      ));

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error(`[Upload] Error: ${fileData.file.name} - ${errorMessage}`);
      
      if (errorMessage === 'Upload cancelled' || abortController.signal.aborted) {
        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'cancelled', error: 'Cancelled' } : f
        ));
        return { success: false, error: 'Cancelled' };
      }

      setFilesToUpload(prev => prev.map(f => 
        f.id === fileData.id ? { ...f, status: 'error', error: errorMessage } : f
      ));

      return { success: false, error: errorMessage };
    }
  };

  // ============================================
  // Upload All Files (Concurrent)
  // ============================================

  const uploadFiles = async () => {
    if (!selectedBatchId || filesToUpload.length === 0) return;

    const pendingFiles = filesToUpload.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setUploading(true);
    abortAllRef.current = false;

    // Initialize upload stats
    const totalBytes = pendingFiles.reduce((sum, f) => sum + f.file.size, 0);
    setUploadStats({
      totalFiles: pendingFiles.length,
      completedFiles: 0,
      totalBytes,
      uploadedBytes: 0,
      startTime: Date.now(),
      averageSpeed: 0,
    });

    console.log(`[Upload] Starting batch upload: ${pendingFiles.length} files, ${formatBytes(totalBytes)} total, concurrency=${MAX_UPLOAD_CONCURRENCY}`);

    // Run uploads with concurrency limit
    const uploadPromises = pendingFiles.map(fileData => async () => {
      const result = await uploadSingleFile(fileData);
      setUploadStats(prev => prev ? {
        ...prev,
        completedFiles: prev.completedFiles + 1,
      } : null);
      return result;
    });

    // Execute with concurrency pool
    const executing: Promise<void>[] = [];
    for (const createPromise of uploadPromises) {
      if (abortAllRef.current) break;
      
      const p = createPromise().then(() => {});
      executing.push(p);

      if (executing.length >= MAX_UPLOAD_CONCURRENCY) {
        await Promise.race(executing);
        // Clean up settled promises
        for (let i = executing.length - 1; i >= 0; i--) {
          let settled = false;
          executing[i].then(() => { settled = true; }).catch(() => { settled = true; });
          if (settled) executing.splice(i, 1);
        }
      }
    }

    await Promise.allSettled(executing);

    console.log('[Upload] Batch upload complete');

    setUploading(false);
    setUploadStats(null);
    loadBatchDetails(selectedBatchId, { silent: true });
  };

  // ============================================
  // Cancel All Uploads
  // ============================================

  const cancelAllUploads = () => {
    console.log('[Upload] Cancelling all uploads');
    abortAllRef.current = true;
    
    setFilesToUpload(prev => prev.map(f => {
      if (f.status === 'uploading' && f.abortController) {
        f.abortController.abort();
        return { ...f, status: 'cancelled', error: 'Cancelled' };
      }
      if (f.status === 'pending') {
        return { ...f, status: 'cancelled', error: 'Cancelled' };
      }
      return f;
    }));

    setUploading(false);
    setUploadStats(null);
  };

  // ============================================
  // Trigger Worker
  // ============================================

  const triggerWorker = async () => {
    try {
      console.log('[Bulk] Triggering processing...');
      const res = await fetch('/api/bulk/process-now', { method: 'POST' });
      const data = await res.json();
      console.log('[Bulk] Processing response:', data);
      
      // Refresh after a short delay
      if (selectedBatchId) {
        setTimeout(() => loadBatchDetails(selectedBatchId, { silent: true }), 1000);
      }
    } catch (error) {
      console.error('[Bulk] Failed to trigger worker:', error);
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
  // Delete Batch
  // ============================================

  const deleteBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to delete this batch and all its submissions?')) return;

    try {
      console.log(`[Bulk] Deleting batch: ${batchId}`);
      await fetch(`/api/bulk/batches?id=${batchId}`, { method: 'DELETE' });
      loadBatches();
      if (selectedBatchId === batchId) {
        setView('list');
        setSelectedBatchId(null);
      }
    } catch (error) {
      console.error('[Bulk] Failed to delete batch:', error);
    }
  };

  // ============================================
  // Calculate Upload Progress from File State
  // ============================================

  const getUploadProgress = () => {
    const uploadingFiles = filesToUpload.filter(f => 
      f.status === 'uploading' || f.status === 'uploaded'
    );
    
    if (uploadingFiles.length === 0) {
      return { totalBytes: 0, uploadedBytes: 0, averageSpeed: 0 };
    }

    const totalBytes = uploadingFiles.reduce((sum, f) => sum + f.file.size, 0);
    const uploadedBytes = uploadingFiles.reduce((sum, f) => {
      if (f.status === 'uploaded') return sum + f.file.size;
      return sum + (f.bytesUploaded || 0);
    }, 0);

    // Average speed from currently uploading files
    const currentlyUploading = uploadingFiles.filter(f => f.status === 'uploading' && f.uploadSpeed > 0);
    const averageSpeed = currentlyUploading.length > 0
      ? currentlyUploading.reduce((sum, f) => sum + f.uploadSpeed, 0) / currentlyUploading.length
      : 0;

    return { totalBytes, uploadedBytes, averageSpeed };
  };

  const calculateETA = (): string => {
    const { totalBytes, uploadedBytes, averageSpeed } = getUploadProgress();
    if (averageSpeed <= 0 || totalBytes === 0) return '--';
    const remainingBytes = totalBytes - uploadedBytes;
    if (remainingBytes <= 0) return '0s';
    const remainingMs = (remainingBytes / averageSpeed) * 1000;
    return formatDuration(remainingMs);
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {view === 'batch' ? (
                <button 
                  onClick={() => { setView('list'); setSelectedBatchId(null); }}
                  className="flex items-center gap-2 text-surface-600 hover:text-surface-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm">Back to Batches</span>
                </button>
              ) : (
                <Link href="/" className="flex items-center gap-2 text-surface-600 hover:text-surface-900">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm">Back to Home</span>
                </Link>
              )}
              <div className="h-6 w-px bg-surface-200" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">
                Bulk Upload
              </h1>
            </div>
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
                  <h2 className="text-2xl font-bold text-surface-900">Your Batches</h2>
                  <p className="text-surface-600 mt-1">Upload and process student presentation videos in bulk</p>
                </div>
                <button
                  onClick={() => setView('create')}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  New Batch
                </button>
              </div>

              {loadingBatches ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              ) : batches.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
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
                </div>
              ) : (
                <div className="space-y-4">
                  {batches.map(batch => (
                    <motion.div
                      key={batch.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => { setSelectedBatchId(batch.id); setView('batch'); }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-surface-900">{batch.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              batch.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
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
                            onClick={(e) => { e.stopPropagation(); deleteBatch(batch.id); }}
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
              )}
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
              <button
                onClick={() => setView('list')}
                className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to batches
              </button>

              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-8">
                <h2 className="text-2xl font-bold text-surface-900 mb-6">Create New Batch</h2>

                <div className="space-y-6 max-w-xl">
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
                      The AI will use this to generate more targeted feedback
                    </p>
                  </div>

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
            >
              <button
                onClick={() => { setView('list'); setSelectedBatchId(null); }}
                className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to batches
              </button>

              {currentBatch && (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-surface-900">{currentBatch.name}</h2>
                      <div className="flex items-center gap-2 mt-1 text-sm text-surface-500">
                        {currentBatch.courseName && <span>{currentBatch.courseName}</span>}
                        {currentBatch.assignmentName && <span>• {currentBatch.assignmentName}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={triggerWorker}
                        className="flex items-center gap-2 px-4 py-2 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 transition-colors"
                        title="Process queued submissions"
                      >
                        <Play className="w-4 h-4" />
                        Process Now
                      </button>
                      <button
                        onClick={exportCsv}
                        disabled={submissions.filter(s => s.status === 'ready').length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                      <button
                        onClick={() => deleteBatch(selectedBatchId)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Stats */}
                  <div className="grid grid-cols-4 gap-4 mt-6">
                    <div className="bg-surface-50 rounded-lg p-4 text-center">
                      <Users className="w-6 h-6 text-surface-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-surface-900">{submissions.length}</div>
                      <div className="text-xs text-surface-500">Total</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                      <Clock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-amber-600">
                        {submissions.filter(s => ['queued', 'transcribing', 'analyzing'].includes(s.status)).length}
                      </div>
                      <div className="text-xs text-surface-500">Processing</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4 text-center">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-emerald-600">
                        {submissions.filter(s => s.status === 'ready').length}
                      </div>
                      <div className="text-xs text-surface-500">Complete</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-red-600">
                        {submissions.filter(s => s.status === 'failed').length}
                      </div>
                      <div className="text-xs text-surface-500">Failed</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Section */}
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 mb-6">
                <h3 className="font-semibold text-surface-900 mb-4">Add Files</h3>

                {/* Drop Zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
                >
                  <Upload className="w-12 h-12 text-surface-400 mx-auto mb-4" />
                  <p className="text-surface-700 font-medium">Drag & drop video or audio files here</p>
                  <p className="text-sm text-surface-500 mt-1">or click to browse</p>
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

                {/* Files to Upload */}
                {filesToUpload.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-surface-700">
                        Files to Upload ({filesToUpload.length})
                      </h4>
                      <div className="flex items-center gap-2">
                        {uploading && (
                          <button
                            onClick={cancelAllUploads}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                          >
                            <X className="w-4 h-4" />
                            Cancel All
                          </button>
                        )}
                        <button
                          onClick={uploadFiles}
                          disabled={uploading || filesToUpload.filter(f => f.status === 'pending').length === 0}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {uploading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              Upload All
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Upload Progress Bar */}
                    {uploading && (() => {
                      const progress = getUploadProgress();
                      const completedCount = filesToUpload.filter(f => f.status === 'uploaded').length;
                      const totalCount = filesToUpload.filter(f => f.status === 'uploading' || f.status === 'uploaded' || f.status === 'pending').length;
                      const percentComplete = progress.totalBytes > 0 ? (progress.uploadedBytes / progress.totalBytes) * 100 : 0;
                      
                      return (
                        <div className="mb-4 p-4 bg-primary-50 rounded-xl">
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-primary-700 font-medium">
                              Uploading {completedCount}/{totalCount} files
                            </span>
                            <span className="text-primary-600">
                              ETA: {calculateETA()} • {formatBytes(progress.averageSpeed)}/s
                            </span>
                          </div>
                          <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary-600 transition-all duration-300"
                              style={{ width: `${Math.min(percentComplete, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-primary-600 mt-1 text-right">
                            {formatBytes(progress.uploadedBytes)} / {formatBytes(progress.totalBytes)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* File List */}
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {filesToUpload.map(fileData => (
                        <div 
                          key={fileData.id} 
                          className={`flex items-center gap-4 p-3 rounded-lg border ${
                            fileData.status === 'error' ? 'bg-red-50 border-red-200' :
                            fileData.status === 'cancelled' ? 'bg-surface-100 border-surface-200 opacity-50' :
                            fileData.status === 'uploaded' ? 'bg-emerald-50 border-emerald-200' :
                            'bg-surface-50 border-surface-200'
                          }`}
                        >
                          {fileData.file.type.startsWith('video') ? (
                            <FileVideo className="w-8 h-8 text-primary-500 flex-shrink-0" />
                          ) : (
                            <FileAudio className="w-8 h-8 text-violet-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-surface-900 truncate">
                              {fileData.file.name}
                            </p>
                            <input
                              type="text"
                              value={fileData.studentName}
                              onChange={(e) => updateStudentName(fileData.id, e.target.value)}
                              disabled={fileData.status !== 'pending'}
                              className="w-full text-xs text-surface-600 bg-transparent border-none p-0 focus:ring-0 disabled:text-surface-400"
                              placeholder="Student name"
                            />
                            {/* Per-file progress */}
                            {fileData.status === 'uploading' && (
                              <div className="mt-1">
                                <div className="h-1 bg-surface-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary-500 transition-all duration-300"
                                    style={{ width: `${fileData.progress}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-xs text-surface-500 mt-0.5">
                                  <span>{fileData.progress}%</span>
                                  <span>{formatBytes(fileData.uploadSpeed)}/s</span>
                                </div>
                              </div>
                            )}
                            {fileData.error && (
                              <p className="text-xs text-red-600 mt-1">{fileData.error}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-surface-500">
                              {formatBytes(fileData.file.size)}
                            </span>
                            {fileData.status === 'pending' && (
                              <button
                                onClick={() => removeFile(fileData.id)}
                                className="p-1 text-surface-400 hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {fileData.status === 'uploading' && (
                              <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                            )}
                            {fileData.status === 'uploaded' && (
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            )}
                            {fileData.status === 'error' && (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submissions List */}
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <h3 className="font-semibold text-surface-900 mb-4">Submissions</h3>

                {loadingSubmissions ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="text-center py-12 text-surface-500">
                    <FileVideo className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                    <p>No submissions yet. Upload files above to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {submissions.map(submission => (
                      <Link
                        key={submission.id}
                        href={`/bulk/submission/${submission.id}`}
                        className="flex items-center justify-between p-4 rounded-xl border border-surface-200 hover:bg-surface-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {getStatusIcon(submission.status)}
                          <div>
                            <p className="font-medium text-surface-900">{submission.studentName}</p>
                            <p className="text-sm text-surface-500">{submission.originalFilename}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium text-surface-700">
                              {getStatusLabel(submission.status)}
                            </p>
                            {submission.overallScore !== undefined && (
                              <p className="text-xs text-surface-500">
                                Score: {submission.overallScore}/100
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-surface-400" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
