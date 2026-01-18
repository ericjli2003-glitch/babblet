'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Upload, Search, Trash2, Loader2, Plus, FileText,
  Presentation, Book, BookOpen, ScrollText, Video, FolderOpen,
  CheckCircle, Clock, Sparkles, Filter, MoreVertical, Download,
  AlertCircle, X, File, Info, ChevronRight
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

// ============================================
// Types
// ============================================

interface Document {
  id: string;
  courseId: string;
  assignmentId?: string;
  name: string;
  type: 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'recording' | 'other';
  fileSize?: number;
  createdAt: number;
  indexed?: boolean;
}

interface Course {
  id: string;
  name: string;
  courseCode: string;
  term: string;
}

interface ExtractedInsight {
  id: string;
  label: string;
}

// ============================================
// Material Type Config
// ============================================

const MATERIAL_TYPES = {
  all: { icon: FolderOpen, label: 'All Materials', color: 'bg-surface-100 text-surface-600' },
  slides: { icon: Presentation, label: 'Slides', color: 'bg-amber-100 text-amber-600' },
  reading: { icon: Book, label: 'Readings', color: 'bg-emerald-100 text-emerald-600' },
  lecture_notes: { icon: BookOpen, label: 'Lecture Notes', color: 'bg-blue-100 text-blue-600' },
  policy: { icon: ScrollText, label: 'Policies', color: 'bg-red-100 text-red-600' },
  example: { icon: FileText, label: 'Examples', color: 'bg-cyan-100 text-cyan-600' },
  recording: { icon: Video, label: 'Class Recordings', color: 'bg-pink-100 text-pink-600' },
  other: { icon: FolderOpen, label: 'Other', color: 'bg-surface-100 text-surface-600' },
};

type MaterialFilter = keyof typeof MATERIAL_TYPES;

// ============================================
// Helper Functions
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

// ============================================
// Document Row Component
// ============================================

function DocumentRow({
  document,
  onDelete,
  isDeleting,
}: {
  document: Document;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const typeConfig = MATERIAL_TYPES[document.type] || MATERIAL_TYPES.other;
  const Icon = typeConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white rounded-xl border border-surface-200 p-4 hover:shadow-sm hover:border-primary-200 transition-all group"
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl ${typeConfig.color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-surface-900 truncate">{document.name}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${typeConfig.color}`}>
              {typeConfig.label.toUpperCase()}
            </span>
            {document.fileSize && (
              <span className="text-xs text-surface-400">{formatFileSize(document.fileSize)}</span>
            )}
            <span className="text-xs text-surface-400">•</span>
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Indexed
            </span>
          </div>
        </div>

        {/* Upload Date */}
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Uploaded</p>
          <p className="text-sm text-surface-600">{formatTimeAgo(document.createdAt)}</p>
        </div>

        {/* Delete Button */}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-2 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export default function ContextLibraryPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [course, setCourse] = useState<Course | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<MaterialFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  
  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadType, setUploadType] = useState<Document['type']>('lecture_notes');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Extracted insights (mock for now, could be derived from embeddings)
  const [insights, setInsights] = useState<ExtractedInsight[]>([
    { id: '1', label: 'Ethics in AI' },
    { id: '2', label: 'Case Study Analysis' },
    { id: '3', label: 'Presentation Rubrics' },
    { id: '4', label: 'Academic Integrity' },
  ]);

  // Load course and documents
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load course info
      const courseRes = await fetch(`/api/context/courses?id=${courseId}`);
      const courseData = await courseRes.json();
      if (courseData.success && courseData.course) {
        setCourse(courseData.course);
      }

      // Load documents
      const docsRes = await fetch(`/api/context/documents?courseId=${courseId}`);
      const docsData = await docsRes.json();
      if (docsData.success) {
        setDocuments(docsData.documents || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesFilter = activeFilter === 'all' || doc.type === activeFilter;
    const matchesSearch = searchQuery === '' || 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Count by type
  const typeCounts = documents.reduce((acc, doc) => {
    acc[doc.type] = (acc[doc.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Delete document
  const deleteDocument = async (docId: string) => {
    if (!confirm('Delete this document? This will also remove its indexed content.')) return;
    
    setDeletingDocId(docId);
    try {
      const res = await fetch(`/api/context/documents?id=${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadFiles(Array.from(files));
      setShowUploadModal(true);
    }
    if (e.target) e.target.value = '';
  };

  // Upload files
  const uploadDocuments = async () => {
    if (uploadFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: uploadFiles.length });

    const results: { success: boolean; name: string }[] = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      setUploadProgress({ current: i + 1, total: uploadFiles.length });

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('courseId', courseId);
        formData.append('type', uploadType);

        const res = await fetch('/api/context/upload-document', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        results.push({ success: data.success, name: file.name });

        if (data.success && data.document) {
          setDocuments((prev) => [data.document, ...prev]);
        }
      } catch {
        results.push({ success: false, name: file.name });
      }
    }

    setUploading(false);
    setUploadProgress(null);
    setShowUploadModal(false);
    setUploadFiles([]);

    const successCount = results.filter((r) => r.success).length;
    if (successCount === results.length) {
      // All succeeded - no alert needed
    } else {
      alert(`Uploaded ${successCount} of ${results.length} files.`);
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

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-surface-500 mb-6">
          <Link href="/courses" className="hover:text-primary-600 transition-colors">
            Home
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-primary-600 font-medium">Smart Content Manager</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Context Library</h1>
            <p className="text-surface-500 mt-1">
              {course?.name} • {course?.courseCode}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Upload Hint */}
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-surface-100 rounded-lg text-sm text-surface-500">
              <Upload className="w-4 h-4" />
              Quick Upload (PPT, PDF, DOCX)
            </div>

            {/* Select Files Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Select Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.pptx,.ppt,.txt,.md,.mp3,.wav,.m4a,.mp4,.webm,.mov"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex items-center justify-between mb-6">
          {/* Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(MATERIAL_TYPES).map(([key, config]) => {
              const isActive = activeFilter === key;
              const count = key === 'all' ? documents.length : typeCounts[key] || 0;
              
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key as MaterialFilter)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white border border-surface-200 text-surface-600 hover:border-primary-300 hover:text-primary-600'
                  }`}
                >
                  {config.label}
                  {count > 0 && (
                    <span className={`ml-1.5 ${isActive ? 'text-primary-200' : 'text-surface-400'}`}>
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Documents List */}
        <div className="space-y-3 mb-8">
          <AnimatePresence mode="popLayout">
            {filteredDocuments.length > 0 ? (
              filteredDocuments.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onDelete={() => deleteDocument(doc.id)}
                  isDeleting={deletingDocId === doc.id}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-xl border border-surface-200 p-12 text-center"
              >
                <FolderOpen className="w-12 h-12 text-surface-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-surface-900 mb-2">
                  {searchQuery ? 'No matching files' : 'No materials uploaded yet'}
                </h3>
                <p className="text-surface-500 mb-6">
                  {searchQuery
                    ? 'Try adjusting your search or filters'
                    : 'Upload slides, readings, and other materials to improve AI grading accuracy'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Materials
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Extracted Insights */}
          <div className="bg-white rounded-2xl border border-surface-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-600" />
              </div>
              <h3 className="font-semibold text-surface-900">Extracted Insights</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {insights.map((insight) => (
                <span
                  key={insight.id}
                  className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium"
                >
                  {insight.label}
                </span>
              ))}
              {insights.length === 0 && (
                <p className="text-sm text-surface-500">
                  Upload materials to see extracted topics and themes
                </p>
              )}
            </div>
          </div>

          {/* Smart Manager Info */}
          <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl border border-primary-200 p-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Info className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900 mb-2">Smart Manager</h3>
                <p className="text-sm text-primary-700 leading-relaxed">
                  Babblet processes your diverse course materials to understand your specific grading criteria. 
                  Uploading more context like <strong>Slides</strong> and <strong>Recordings</strong> significantly 
                  improves AI accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !uploading && setShowUploadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl border border-surface-200 p-6 w-full max-w-lg"
            >
              <h3 className="font-semibold text-xl text-surface-900 mb-4">Upload Course Materials</h3>

              <div className="space-y-4">
                {/* Material Type */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Material Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as Document['type'])}
                    className="w-full px-4 py-2.5 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="slides">Slides</option>
                    <option value="reading">Readings</option>
                    <option value="lecture_notes">Lecture Notes</option>
                    <option value="policy">Policies</option>
                    <option value="example">Examples</option>
                    <option value="recording">Class Recordings</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Selected Files */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Selected Files ({uploadFiles.length})
                  </label>
                  <div className="max-h-48 overflow-y-auto space-y-2 bg-surface-50 rounded-xl p-3">
                    {uploadFiles.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-surface-200"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="w-4 h-4 text-primary-500 flex-shrink-0" />
                          <span className="text-sm text-surface-700 truncate">{file.name}</span>
                          <span className="text-xs text-surface-400 flex-shrink-0">
                            ({formatFileSize(file.size)})
                          </span>
                        </div>
                        <button
                          onClick={() => setUploadFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-surface-400 hover:text-red-500 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Upload Progress */}
                {uploadProgress && (
                  <div className="p-3 bg-primary-50 rounded-xl">
                    <div className="flex items-center justify-between text-sm text-primary-700 mb-2">
                      <span>Uploading {uploadProgress.current} of {uploadProgress.total}...</span>
                      <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 transition-all duration-300"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFiles([]);
                  }}
                  disabled={uploading}
                  className="px-4 py-2.5 text-surface-600 hover:bg-surface-100 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={uploadDocuments}
                  disabled={uploadFiles.length === 0 || uploading}
                  className="px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload {uploadFiles.length} File{uploadFiles.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
