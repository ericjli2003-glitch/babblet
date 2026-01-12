'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, FileText, Book, Presentation, ScrollText,
  Plus, Upload, ChevronRight, Clock, Users, CheckCircle,
  AlertCircle, Play, Calendar, Loader2, Trash2, Edit3,
  BookOpen, GraduationCap, FolderOpen, Sparkles, MoreVertical,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';

// ============================================
// Types
// ============================================

interface Course {
  id: string;
  name: string;
  courseCode: string;
  term: string;
  description?: string;
  summary?: string;
  keyThemes?: string[];
}

interface Assignment {
  id: string;
  courseId: string;
  name: string;
  instructions: string;
  dueDate?: string;
  rubricId?: string;
  createdAt: number;
}

interface Document {
  id: string;
  courseId: string;
  assignmentId?: string;
  name: string;
  type: 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'other' | 'rubric';
  createdAt: number;
}

interface BundleVersion {
  id: string;
  version: number;
  createdAt: number;
}

interface AssignmentStats {
  submissionCount: number;
  processedCount: number;
  failedCount: number;
  bundleVersion?: number;
}

interface ClassWorkspaceProps {
  course: Course;
  onSelectAssignment: (assignment: Assignment) => void;
  onCreateAssignment: () => void;
  onUploadDocument: () => void;
}

// ============================================
// Material Type Config
// ============================================

const MATERIAL_TYPES = {
  rubric: { icon: ClipboardList, label: 'Rubrics', color: 'bg-violet-100 text-violet-600' },
  lecture_notes: { icon: BookOpen, label: 'Lecture Notes', color: 'bg-blue-100 text-blue-600' },
  slides: { icon: Presentation, label: 'Slides', color: 'bg-amber-100 text-amber-600' },
  reading: { icon: Book, label: 'Readings', color: 'bg-emerald-100 text-emerald-600' },
  policy: { icon: ScrollText, label: 'Policies', color: 'bg-red-100 text-red-600' },
  example: { icon: FileText, label: 'Examples', color: 'bg-cyan-100 text-cyan-600' },
  other: { icon: FolderOpen, label: 'Other', color: 'bg-surface-100 text-surface-600' },
};

// ============================================
// Assignment Card Component
// ============================================

function AssignmentCard({ 
  assignment, 
  stats,
  courseId,
  onClick,
  onDelete
}: { 
  assignment: Assignment;
  stats?: AssignmentStats;
  courseId: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  
  const getStatus = () => {
    if (!stats || stats.submissionCount === 0) {
      return { label: 'No submissions', color: 'bg-surface-100 text-surface-600', icon: AlertCircle };
    }
    if (stats.processedCount === stats.submissionCount) {
      return { label: 'Complete', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
    }
    if (stats.processedCount > 0) {
      return { label: 'In progress', color: 'bg-amber-100 text-amber-700', icon: Play };
    }
    return { label: 'Not started', color: 'bg-surface-100 text-surface-600', icon: Clock };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-white rounded-2xl shadow-sm border border-surface-200 p-5 hover:shadow-lg hover:border-primary-200 transition-all text-left group relative"
    >
      {/* Main clickable area */}
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-primary-500 flex items-center justify-center flex-shrink-0 shadow-md">
              <ClipboardList className="w-7 h-7 text-white" />
            </div>
            
            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-surface-900 group-hover:text-primary-700 transition-colors">
                {assignment.name}
              </h3>
              <p className="text-sm text-surface-500 line-clamp-2 mt-1">
                {assignment.instructions}
              </p>
              
              {/* Meta row */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {/* Status badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
                
                {/* Due date */}
                {assignment.dueDate && (
                  <span className="inline-flex items-center gap-1 text-xs text-surface-500">
                    <Calendar className="w-3 h-3" />
                    Due: {assignment.dueDate}
                  </span>
                )}
                
                {/* Submission count */}
                {stats && stats.submissionCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-surface-500">
                    <Users className="w-3 h-3" />
                    {stats.processedCount}/{stats.submissionCount} graded
                  </span>
                )}
                
                {/* Context version */}
                {stats?.bundleVersion && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    Context v{stats.bundleVersion}
                  </span>
                )}
                
                {/* Rubric indicator */}
                {assignment.rubricId && (
                  <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Rubric
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Arrow */}
          <ChevronRight className="w-5 h-5 text-surface-300 group-hover:text-primary-500 transition-colors flex-shrink-0 mt-2 mr-8" />
        </div>
      </button>
      
      {/* Context Menu Button */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
        
        {/* Dropdown Menu */}
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-surface-200 py-1 z-10"
            >
              <Link
                href={`/bulk?courseId=${courseId}&assignmentId=${assignment.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Submissions
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onClick();
                }}
                className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit Assignment
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Assignment
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================
// Material Card Component
// ============================================

function MaterialCard({ 
  document, 
  onClick,
  onDelete,
  isDeleting,
}: { 
  document: Document;
  onClick: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}) {
  const typeConfig = MATERIAL_TYPES[document.type] || MATERIAL_TYPES.other;
  const Icon = typeConfig.icon;

  return (
    <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-surface-200 hover:border-primary-200 hover:shadow-sm transition-all group">
      <button
        onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className={`w-10 h-10 rounded-xl ${typeConfig.color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-900 truncate group-hover:text-primary-700 transition-colors">
            {document.name}
          </p>
          <p className="text-xs text-surface-400">
            {new Date(document.createdAt).toLocaleDateString()}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-primary-500 flex-shrink-0" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        className="p-2 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
        title="Delete document"
      >
        {isDeleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// ============================================
// Empty State Component
// ============================================

function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  onAction 
}: {
  icon: typeof ClipboardList;
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-surface-400" />
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-2">{title}</h3>
      <p className="text-surface-500 mb-6 max-w-sm">{description}</p>
      <button
        onClick={onAction}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {action}
      </button>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function ClassWorkspace({
  course,
  onSelectAssignment,
  onCreateAssignment,
  onUploadDocument,
}: ClassWorkspaceProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<Record<string, AssignmentStats>>({});
  
  // Delete confirmation state
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Document delete state
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'assignments' | 'grading' | 'materials' | 'settings'>('assignments');
  
  // Course settings state
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState(course.summary || '');
  const [keyThemesText, setKeyThemesText] = useState(course.keyThemes?.join(', ') || '');
  const [savingSettings, setSavingSettings] = useState(false);

  // Load assignments and documents
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load assignments
      const assignmentsRes = await fetch(`/api/context/assignments?courseId=${course.id}`);
      const assignmentsData = await assignmentsRes.json();
      if (assignmentsData.success) {
        setAssignments(assignmentsData.assignments || []);
        
        // Load stats for each assignment
        const statsPromises = (assignmentsData.assignments || []).map(async (a: Assignment) => {
          try {
            // Get batches for this assignment
            const batchRes = await fetch(`/api/bulk/batches?assignmentId=${a.id}`);
            const batchData = await batchRes.json();
            
            let submissionCount = 0;
            let processedCount = 0;
            let failedCount = 0;
            let bundleVersion: number | undefined;
            
            if (batchData.success && batchData.batches) {
              for (const batch of batchData.batches) {
                submissionCount += batch.totalSubmissions || 0;
                processedCount += batch.processedCount || 0;
                failedCount += batch.failedCount || 0;
              }
            }
            
            // Get bundle version
            const bundleRes = await fetch(`/api/context/bundles?assignmentId=${a.id}`);
            const bundleData = await bundleRes.json();
            if (bundleData.success && bundleData.latestVersion) {
              bundleVersion = bundleData.latestVersion.version;
            }
            
            return { 
              assignmentId: a.id, 
              stats: { submissionCount, processedCount, failedCount, bundleVersion } 
            };
          } catch (e) {
            return { assignmentId: a.id, stats: { submissionCount: 0, processedCount: 0, failedCount: 0 } };
          }
        });
        
        const statsResults = await Promise.all(statsPromises);
        const statsMap: Record<string, AssignmentStats> = {};
        for (const r of statsResults) {
          statsMap[r.assignmentId] = r.stats;
        }
        setAssignmentStats(statsMap);
      }
      
      // Load documents
      const docsRes = await fetch(`/api/context/documents?courseId=${course.id}`);
      const docsData = await docsRes.json();
      if (docsData.success) {
        setDocuments(docsData.documents || []);
      }
      
    } catch (error) {
      console.error('Failed to load workspace data:', error);
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Delete assignment with cascade
  const deleteAssignment = async (assignment: Assignment) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/context/assignments?id=${assignment.id}&cascade=true`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        // Remove from local state
        setAssignments(prev => prev.filter(a => a.id !== assignment.id));
        setAssignmentToDelete(null);
        
        // Update stats
        const newStats = { ...assignmentStats };
        delete newStats[assignment.id];
        setAssignmentStats(newStats);
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to delete assignment:', error);
      alert('Failed to delete assignment. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete document
  const deleteDocument = async (document: Document) => {
    setDeletingDocId(document.id);
    try {
      const res = await fetch(`/api/context/documents?id=${document.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        // Remove from local state
        setDocuments(prev => prev.filter(d => d.id !== document.id));
        setDocumentToDelete(null);
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document. Please try again.');
    } finally {
      setDeletingDocId(null);
    }
  };

  // Group documents by type
  const groupedDocuments = documents.reduce((acc, doc) => {
    const type = doc.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  // Count stats
  const totalAssignments = assignments.length;
  const totalMaterials = documents.length;
  const totalSubmissions = Object.values(assignmentStats).reduce((sum, s) => sum + s.submissionCount, 0);
  const gradedSubmissions = Object.values(assignmentStats).reduce((sum, s) => sum + s.processedCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Class Header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-violet-500 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-6 h-6" />
              <span className="text-primary-100 font-medium">{course.courseCode}</span>
              <span className="text-primary-200">•</span>
              <span className="text-primary-100">{course.term}</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">{course.name}</h1>
            {course.description && (
              <p className="text-primary-100 max-w-2xl">{course.description}</p>
            )}
          </div>
          
          {/* Quick stats */}
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-3xl font-bold">{totalAssignments}</p>
              <p className="text-primary-100 text-sm">Assignments</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{totalSubmissions}</p>
              <p className="text-primary-100 text-sm">Submissions</p>
            </div>
            {totalSubmissions > 0 && (
              <div>
                <p className="text-3xl font-bold">{Math.round((gradedSubmissions / totalSubmissions) * 100)}%</p>
                <p className="text-primary-100 text-sm">Graded</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={onCreateAssignment}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Assignment
        </button>
        <button
          onClick={onUploadDocument}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" />
          Upload Materials
        </button>
        <Link
          href={`/bulk?courseId=${course.id}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <FileText className="w-4 h-4" />
          Bulk Upload Submissions
        </Link>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-surface-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`px-4 py-3 font-medium text-sm transition-colors relative ${
              activeTab === 'assignments'
                ? 'text-primary-600'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Assignments
              <span className="bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full text-xs">
                {totalAssignments}
              </span>
            </span>
            {activeTab === 'assignments' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`px-4 py-3 font-medium text-sm transition-colors relative ${
              activeTab === 'materials'
                ? 'text-primary-600'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Course Materials
              <span className="bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full text-xs">
                {totalMaterials}
              </span>
            </span>
            {activeTab === 'materials' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-3 font-medium text-sm transition-colors relative ${
              activeTab === 'settings'
                ? 'text-primary-600'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Edit3 className="w-4 h-4" />
              Context Settings
            </span>
            {activeTab === 'settings' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
              />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <motion.div
            key="assignments"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {assignments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-surface-200 shadow-sm">
                <EmptyState
                  icon={ClipboardList}
                  title="No assignments yet"
                  description="Create your first assignment to start building rubrics and grading context."
                  action="Create Assignment"
                  onAction={onCreateAssignment}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    stats={assignmentStats[assignment.id]}
                    courseId={course.id}
                    onClick={() => onSelectAssignment(assignment)}
                    onDelete={() => setAssignmentToDelete(assignment)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <motion.div
            key="materials"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {documents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-surface-200 shadow-sm">
                <EmptyState
                  icon={BookOpen}
                  title="No course materials yet"
                  description="Upload lecture notes, readings, and rubrics to help Babblet provide better feedback."
                  action="Upload Materials"
                  onAction={onUploadDocument}
                />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {Object.entries(MATERIAL_TYPES).map(([type, config]) => {
                  const docs = groupedDocuments[type] || [];
                  if (docs.length === 0) return null;
                  
                  return (
                    <div key={type} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center`}>
                          <config.icon className="w-4 h-4" />
                        </div>
                        <h3 className="font-semibold text-surface-900">{config.label}</h3>
                        <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
                          {docs.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {docs.map((doc) => (
                          <MaterialCard
                            key={doc.id}
                            document={doc}
                            onClick={() => {
                              // Could open preview/edit modal
                              console.log('Open document:', doc.id);
                            }}
                            onDelete={() => setDocumentToDelete(doc)}
                            isDeleting={deletingDocId === doc.id}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Using shared materials indicator */}
            {documents.length > 0 && (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="font-medium text-emerald-800">Using Class Materials</p>
                    <p className="text-sm text-emerald-600">
                      All assignments in this class will use these materials to improve Babblet&apos;s grading feedback.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Course Summary Section */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-surface-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary-500" />
                    Course Summary
                  </h3>
                  <p className="text-sm text-surface-500 mt-1">
                    This summary is used as a fallback when specific context retrieval yields low-confidence matches.
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Course Summary
                  </label>
                  <textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    placeholder="Describe the key objectives, themes, and expectations for this course. This helps Babblet provide course-relevant feedback when specific materials don't match."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  />
                  <p className="text-xs text-surface-400 mt-1">
                    Example: &quot;This course focuses on persuasive public speaking, emphasizing thesis development, evidence-based arguments, and audience engagement techniques.&quot;
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Key Themes & Concepts
                  </label>
                  <input
                    type="text"
                    value={keyThemesText}
                    onChange={(e) => setKeyThemesText(e.target.value)}
                    placeholder="e.g., rhetoric, ethos, pathos, logos, audience analysis"
                    className="w-full px-4 py-2.5 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  />
                  <p className="text-xs text-surface-400 mt-1">
                    Comma-separated list of key terms and concepts taught in this course.
                  </p>
                </div>
                
                <div className="flex justify-end pt-2">
                  <button
                    onClick={async () => {
                      setSavingSettings(true);
                      try {
                        const keyThemes = keyThemesText
                          .split(',')
                          .map(t => t.trim())
                          .filter(t => t.length > 0);
                        
                        const res = await fetch(`/api/context/courses?id=${course.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            summary: summaryText.trim() || undefined,
                            keyThemes: keyThemes.length > 0 ? keyThemes : undefined,
                          }),
                        });
                        
                        if (res.ok) {
                          alert('Course settings saved!');
                        }
                      } catch (error) {
                        console.error('Failed to save settings:', error);
                        alert('Failed to save settings');
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
            
            {/* Context Quality Explanation */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                How Context Retrieval Works
              </h3>
              <div className="space-y-3 text-sm text-blue-800">
                <p>
                  <strong>1. Smart Retrieval:</strong> For each student presentation, we retrieve the most relevant snippets from your course materials based on what they discussed and each rubric criterion.
                </p>
                <p>
                  <strong>2. Per-Criterion Context:</strong> Each rubric criterion gets its own set of relevant materials, so feedback is always grounded in your course content.
                </p>
                <p>
                  <strong>3. Quality Thresholds:</strong> We only include materials with high relevance scores (above 25%). Low-confidence matches are filtered out.
                </p>
                <p>
                  <strong>4. Fallback Summary:</strong> If no high-quality matches are found, we use your course summary to ensure feedback stays course-relevant.
                </p>
                <p>
                  <strong>5. Budget Controls:</strong> We cap context at ~8,000 characters to keep Babblet focused and avoid overwhelming it with too much information.
                </p>
              </div>
            </div>
            
            {/* Context Stats */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
              <h3 className="font-semibold text-surface-900 mb-4">Context Coverage</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <p className="text-3xl font-bold text-primary-600">{documents.length}</p>
                  <p className="text-sm text-surface-500">Documents</p>
                </div>
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <p className="text-3xl font-bold text-violet-600">{assignments.length}</p>
                  <p className="text-sm text-surface-500">Assignments</p>
                </div>
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <p className="text-3xl font-bold text-emerald-600">{course.summary ? '✓' : '—'}</p>
                  <p className="text-sm text-surface-500">Summary Set</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {assignmentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !isDeleting && setAssignmentToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl border border-surface-200 p-6 w-full max-w-md"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-surface-900">Delete Assignment</h3>
                  <p className="text-sm text-surface-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-red-800 font-medium mb-2">
                  Deleting &quot;{assignmentToDelete.name}&quot; will also delete:
                </p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    All uploaded batches and submissions
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    All grading results and feedback
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    Associated rubrics and context versions
                  </li>
                </ul>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setAssignmentToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 text-surface-600 hover:bg-surface-100 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteAssignment(assignmentToDelete)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Assignment
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Document Confirmation Modal */}
      <AnimatePresence>
        {documentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !deletingDocId && setDocumentToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl border border-surface-200 p-6 w-full max-w-md"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-surface-900">Delete Document</h3>
                  <p className="text-sm text-surface-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-surface-700">
                  Are you sure you want to delete <strong>&quot;{documentToDelete.name}&quot;</strong>?
                </p>
                <p className="text-sm text-surface-500 mt-2">
                  This will also remove all associated text chunks and embeddings used for AI grading context.
                </p>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDocumentToDelete(null)}
                  disabled={!!deletingDocId}
                  className="px-4 py-2.5 text-surface-600 hover:bg-surface-100 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteDocument(documentToDelete)}
                  disabled={!!deletingDocId}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {deletingDocId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Document
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

