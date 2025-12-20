'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, FolderOpen, Plus, Trash2, Download, RefreshCw, 
  CheckCircle, XCircle, Clock, Loader2, FileVideo, FileAudio,
  ChevronRight, ArrowLeft, Users, BarChart3, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';

// ============================================
// Types
// ============================================

type SubmissionStatus = 'queued' | 'uploading' | 'transcribing' | 'analyzing' | 'ready' | 'failed';

interface FileToUpload {
  file: File;
  id: string;
  studentName: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      console.error('Failed to load batches:', error);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // ============================================
  // Create Batch
  // ============================================

  const handleCreateBatch = async () => {
    if (!batchName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch('/api/bulk/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName,
          courseName: courseName || undefined,
          assignmentName: assignmentName || undefined,
          rubricCriteria: rubricCriteria || undefined,
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
        loadBatches();
      }
    } catch (error) {
      console.error('Failed to create batch:', error);
    } finally {
      setCreating(false);
    }
  };

  // ============================================
  // Load Batch Details
  // ============================================

  const loadBatchDetails = useCallback(async (batchId: string) => {
    try {
      setLoadingSubmissions(true);
      const res = await fetch(`/api/bulk/status?batchId=${batchId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentBatch(data.batch);
        setSubmissions(data.submissions || []);
      }
    } catch (error) {
      console.error('Failed to load batch details:', error);
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'batch' && selectedBatchId) {
      loadBatchDetails(selectedBatchId);
      // Poll for updates every 5 seconds
      const interval = setInterval(() => loadBatchDetails(selectedBatchId), 5000);
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
    setFilesToUpload(prev => prev.filter(f => f.id !== id));
  };

  const updateStudentName = (id: string, name: string) => {
    setFilesToUpload(prev => prev.map(f => f.id === id ? { ...f, studentName: name } : f));
  };

  // ============================================
  // Upload Files
  // ============================================

  const uploadFiles = async () => {
    if (!selectedBatchId || filesToUpload.length === 0) return;

    setUploading(true);

    for (const fileData of filesToUpload) {
      if (fileData.status !== 'pending') continue;

      try {
        // Update status
        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'uploading', progress: 10 } : f
        ));

        // Get presigned URL
        const presignRes = await fetch('/api/bulk/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: selectedBatchId,
            filename: fileData.file.name,
            contentType: fileData.file.type,
          }),
        });
        const presignData = await presignRes.json();
        
        if (!presignData.success) {
          throw new Error(presignData.error || 'Failed to get upload URL');
        }

        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, progress: 30 } : f
        ));

        // Upload to R2
        const uploadRes = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': fileData.file.type },
          body: fileData.file,
        });

        if (!uploadRes.ok) {
          throw new Error('Upload failed');
        }

        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, progress: 70 } : f
        ));

        // Enqueue for processing
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
        });

        if (!enqueueRes.ok) {
          throw new Error('Failed to enqueue');
        }

        // Kick off processing immediately (don't wait for cron)
        fetch('/api/bulk/worker', { method: 'POST' }).catch(() => {});

        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'uploaded', progress: 100 } : f
        ));

      } catch (error) {
        setFilesToUpload(prev => prev.map(f => 
          f.id === fileData.id ? { 
            ...f, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Upload failed' 
          } : f
        ));
      }
    }

    setUploading(false);
    
    // Trigger worker multiple times to process the batch (each run handles up to 3 items)
    for (let i = 0; i < 3; i++) {
      fetch('/api/bulk/worker', { method: 'POST' }).catch(() => {});
    }
    
    loadBatchDetails(selectedBatchId);
  };

  // ============================================
  // Trigger Worker
  // ============================================

  const triggerWorker = async () => {
    try {
      await fetch('/api/bulk/worker', { method: 'POST' });
      if (selectedBatchId) {
        setTimeout(() => loadBatchDetails(selectedBatchId), 1000);
      }
    } catch (error) {
      console.error('Failed to trigger worker:', error);
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
      await fetch(`/api/bulk/batches?id=${batchId}`, { method: 'DELETE' });
      loadBatches();
      if (selectedBatchId === batchId) {
        setView('list');
        setSelectedBatchId(null);
      }
    } catch (error) {
      console.error('Failed to delete batch:', error);
    }
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
              <Link href="/live" className="flex items-center gap-2 text-surface-600 hover:text-surface-900">
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm">Back to Dashboard</span>
              </Link>
              <div className="h-6 w-px bg-surface-200" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">
                Bulk Upload
              </h1>
            </div>
            {view === 'list' && (
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Batch
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Batch List View */}
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-surface-900">Your Batches</h2>
                <p className="text-surface-600 mt-1">Upload and process student presentation videos in bulk</p>
              </div>

              {loadingBatches ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              ) : batches.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
                  <FolderOpen className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">No batches yet</h3>
                  <p className="text-surface-600 mb-6">Create a batch to start uploading student presentations</p>
                  <button
                    onClick={() => setView('create')}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Batch
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {batches.map(batch => (
                    <motion.div
                      key={batch.id}
                      className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setView('batch');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-surface-900">{batch.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              batch.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              batch.status === 'processing' ? 'bg-amber-100 text-amber-700' :
                              'bg-surface-100 text-surface-700'
                            }`}>
                              {batch.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-surface-500">
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
                          {batch.failedCount > 0 && (
                            <div className="text-center">
                              <div className="text-2xl font-bold text-red-600">{batch.failedCount}</div>
                              <div className="text-xs text-surface-500">Failed</div>
                            </div>
                          )}
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
              className="max-w-2xl mx-auto"
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

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-2">
                      Batch Name *
                    </label>
                    <input
                      type="text"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="e.g., COMM 101 Final Presentations"
                      className="w-full px-4 py-3 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-2">
                        Course Name (optional)
                      </label>
                      <input
                        type="text"
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                        placeholder="e.g., COMM 101"
                        className="w-full px-4 py-3 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                        placeholder="e.g., Final Presentation"
                        className="w-full px-4 py-3 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-2">
                      Rubric Criteria (optional)
                    </label>
                    <textarea
                      value={rubricCriteria}
                      onChange={(e) => setRubricCriteria(e.target.value)}
                      placeholder="Enter your grading criteria, one per line..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-surface-500 mt-1">
                      This will be used to evaluate each presentation against your specific criteria
                    </p>
                  </div>

                  <button
                    onClick={handleCreateBatch}
                    disabled={!batchName.trim() || creating}
                    className="w-full py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      'Create Batch & Add Files'
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
                onClick={() => {
                  setView('list');
                  setFilesToUpload([]);
                }}
                className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to batches
              </button>

              {currentBatch && (
                <>
                  {/* Batch Header */}
                  <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 mb-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-surface-900">{currentBatch.name}</h2>
                        <div className="flex items-center gap-4 mt-2 text-sm text-surface-500">
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
                          <RefreshCw className="w-4 h-4" />
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
                          <button
                            onClick={uploadFiles}
                            disabled={uploading || filesToUpload.every(f => f.status !== 'pending')}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {filesToUpload.map(fileData => (
                            <div
                              key={fileData.id}
                              className="flex items-center gap-4 p-3 bg-surface-50 rounded-lg"
                            >
                              {fileData.file.type.startsWith('video') ? (
                                <FileVideo className="w-8 h-8 text-primary-500 flex-shrink-0" />
                              ) : (
                                <FileAudio className="w-8 h-8 text-violet-500 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-surface-600 truncate">{fileData.file.name}</p>
                                <input
                                  type="text"
                                  value={fileData.studentName}
                                  onChange={(e) => updateStudentName(fileData.id, e.target.value)}
                                  className="mt-1 w-full text-sm px-2 py-1 border border-surface-200 rounded focus:ring-1 focus:ring-primary-500"
                                  placeholder="Student name"
                                  disabled={fileData.status !== 'pending'}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                {fileData.status === 'pending' && (
                                  <button
                                    onClick={() => removeFile(fileData.id)}
                                    className="p-1 text-surface-400 hover:text-red-500"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                {fileData.status === 'uploading' && (
                                  <div className="w-16 h-2 bg-surface-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary-500 transition-all"
                                      style={{ width: `${fileData.progress}%` }}
                                    />
                                  </div>
                                )}
                                {fileData.status === 'uploaded' && (
                                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                                )}
                                {fileData.status === 'error' && (
                                  <span className="text-xs text-red-500">{fileData.error}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submissions Table */}
                  <div className="bg-white rounded-2xl shadow-sm border border-surface-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-surface-200">
                      <h3 className="font-semibold text-surface-900">Submissions</h3>
                    </div>
                    {loadingSubmissions && submissions.length === 0 ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                      </div>
                    ) : submissions.length === 0 ? (
                      <div className="text-center py-12 text-surface-500">
                        No submissions yet. Upload files above to get started.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-surface-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase">Student</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase">File</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase">Status</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase">Score</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-100">
                            {submissions.map(sub => (
                              <tr key={sub.id} className="hover:bg-surface-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="font-medium text-surface-900">{sub.studentName}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-surface-600 truncate max-w-xs">
                                    {sub.originalFilename}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(sub.status)}
                                    <span className="text-sm">{getStatusLabel(sub.status)}</span>
                                  </div>
                                  {sub.errorMessage && (
                                    <p className="text-xs text-red-500 mt-1">{sub.errorMessage}</p>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {sub.overallScore !== undefined ? (
                                    <span className="text-lg font-bold text-surface-900">
                                      {sub.overallScore.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-surface-400">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {sub.status === 'ready' && (
                                    <Link
                                      href={`/bulk/submission/${sub.id}`}
                                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                                    >
                                      View Report
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

