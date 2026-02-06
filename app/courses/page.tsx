'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus, ChevronRight, TrendingUp,
  AlertCircle, Play, Eye, Loader2, BookOpen, Trash2, MoreVertical, Library, X
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import BatchWizard from '@/components/BatchWizard';

// ============================================
// Types
// ============================================

interface Assignment {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  classAverage?: number;
  totalSubmissions: number;
  gradedCount: number;
  gradientClass: string;
}

interface Course {
  id: string;
  name: string;
  courseCode?: string;
  term?: string;
  section?: string;
  assignments: Assignment[];
  totalSubmissions: number;
  submissionGrowth?: number;
  flaggedStudents?: Array<{
    name: string;
    issue: string;
  }>;
}

// ============================================
// Mock Data
// ============================================

const mockCourses: Course[] = [
  {
    id: 'course-1',
    name: 'Philosophy 101',
    courseCode: 'PHIL101',
    term: 'Fall 2023 Semester',
    section: 'Section A & B',
    totalSubmissions: 150,
    submissionGrowth: 12,
    assignments: [
      {
        id: 'assign-1',
        name: 'Midterm Ethics',
        status: 'in_progress',
        classAverage: 84,
        totalSubmissions: 50,
        gradedCount: 45,
        gradientClass: 'from-primary-500 to-primary-600',
      },
      {
        id: 'assign-2',
        name: 'Final Project',
        status: 'not_started',
        totalSubmissions: 48,
        gradedCount: 0,
        gradientClass: 'from-surface-700 to-surface-800',
      },
      {
        id: 'assign-3',
        name: 'Weekly Reflections',
        status: 'completed',
        classAverage: 92,
        totalSubmissions: 52,
        gradedCount: 52,
        gradientClass: 'from-teal-500 to-teal-600',
      },
    ],
    flaggedStudents: [
      { name: 'Marcus Aurelius', issue: 'Missing audio file' },
      { name: 'Hypatia of Alex', issue: 'Critical rubric error' },
      { name: 'Thomas Aquinas', issue: 'Low score outlier' },
    ],
  },
];

// ============================================
// Helper Functions
// ============================================

function getStatusBadge(status: Assignment['status']) {
  switch (status) {
    case 'in_progress':
      return { label: 'In Progress', className: 'bg-amber-500 text-white' };
    case 'completed':
      return { label: 'Completed', className: 'bg-emerald-500 text-white' };
    default:
      return { label: 'Not Started', className: 'bg-surface-400 text-white' };
  }
}

// ============================================
// Components
// ============================================

function AssignmentCard({ 
  assignment, 
  courseId, 
  courseName,
  onDelete,
}: { 
  assignment: Assignment; 
  courseId: string; 
  courseName?: string;
  onDelete?: (assignmentId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const status = getStatusBadge(assignment.status);
  const progress = assignment.totalSubmissions > 0
    ? (assignment.gradedCount / assignment.totalSubmissions) * 100
    : 0;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${assignment.name}"? This will permanently remove all submissions and cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/bulk/batches?id=${assignment.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        onDelete?.(assignment.id);
      } else {
        alert('Failed to delete assignment: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete assignment');
    } finally {
      setIsDeleting(false);
      setShowMenu(false);
    }
  };

  return (
    <div className="relative">
      <Link href={`/bulk/class/${courseId}/assignment/${assignment.id}/batch/${assignment.id}`}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${isDeleting ? 'opacity-50' : ''}`}
        >
          {/* Card Header with Gradient */}
          <div className={`bg-gradient-to-br ${assignment.gradientClass} p-5 text-white relative`}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-lg pr-20">{assignment.name}</h3>
              {/* Status badge - positioned to leave room for menu */}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/70 text-xs uppercase tracking-wide">Class Avg</p>
                <p className="text-2xl font-bold">
                  {assignment.classAverage ? `${assignment.classAverage}%` : '--'}
                </p>
              </div>
              <div>
                <p className="text-white/70 text-xs uppercase tracking-wide">Submissions</p>
                <p className="text-2xl font-bold">{assignment.totalSubmissions}</p>
              </div>
            </div>
          </div>

          {/* Card Footer */}
          <div className="bg-white p-4 border border-t-0 border-surface-200 rounded-b-2xl">
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                <span>Grading Progress</span>
                <span>{assignment.gradedCount}/{assignment.totalSubmissions} Graded ({Math.round(progress)}%)</span>
              </div>
              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${assignment.gradientClass} transition-all`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div
              className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                assignment.status === 'completed'
                  ? 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                  : assignment.status === 'in_progress'
                    ? 'bg-white border border-surface-200 text-surface-700 hover:bg-surface-50'
                    : 'bg-primary-500 text-white hover:bg-primary-600'
              }`}
            >
              {assignment.status === 'completed' ? (
                <>
                  <Eye className="w-4 h-4" />
                  View All Grades
                </>
              ) : assignment.status === 'in_progress' ? (
                <>
                  <Play className="w-4 h-4" />
                  Launch Batch Grading
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Bulk Grading
                </>
              )}
            </div>
          </div>
        </motion.div>
      </Link>

      {/* Status Badge + Menu Button - positioned absolutely on top of card */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}>
          {status.label}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMenu(false);
              }}
            />
            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-20 min-w-[140px]">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuickStats({ course }: { course: Course }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-6">
      <h3 className="font-semibold text-surface-900 mb-4">Quick Stats</h3>

      {/* Total Submissions */}
      <div className="mb-6">
        <p className="text-xs text-surface-500 uppercase tracking-wide mb-1">Total Submissions</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-surface-900">{course.totalSubmissions}</span>
          {course.submissionGrowth && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
              <TrendingUp className="w-3 h-3" />
              +{course.submissionGrowth}%
            </span>
          )}
        </div>
      </div>

      {/* Average Grade Trend */}
      <div className="mb-6">
        <p className="text-xs text-surface-500 uppercase tracking-wide mb-2">Average Grade Trend</p>
        <div className="h-16 flex items-end gap-1">
          {[40, 55, 45, 60, 50, 70, 65, 75, 80, 85, 78, 90].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-primary-500 rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-surface-400 mt-1">
          <span>Week 1</span>
          <span>Week 12</span>
        </div>
      </div>

      {/* Flagged for Review */}
      {course.flaggedStudents && course.flaggedStudents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Flagged for Review</p>
            <span className="w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {course.flaggedStudents.length}
            </span>
          </div>
          <div className="space-y-2">
            {course.flaggedStudents.map((student, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-xs font-medium text-surface-600">
                  {student.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{student.name}</p>
                  <p className="text-xs text-red-500 truncate">{student.issue}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Detailed Insights */}
      <button className="w-full mt-6 py-2.5 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200 transition-colors">
        View Detailed Course Insights
      </button>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

// Gradient classes for assignments
const assignmentGradients = [
  'from-primary-500 to-primary-600',
  'from-teal-500 to-teal-600',
  'from-violet-500 to-violet-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
];

// ============================================
// Create Course Modal
// ============================================

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCourseId: string) => void;
}

function CreateCourseModal({ isOpen, onClose, onSuccess }: CreateCourseModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    courseCode: '',
    term: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.courseCode.trim() || !formData.term.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/context/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setFormData({ name: '', courseCode: '', term: '', description: '' });
        onSuccess(data.course?.id || data.id || '');
        onClose();
      } else {
        setError(data.error || 'Failed to create course');
      }
    } catch (err) {
      setError('Failed to create course. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Create New Course</h2>
            <p className="text-sm text-surface-500">Add a new course to your dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Course Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Introduction to Philosophy"
              className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Course Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.courseCode}
                onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                placeholder="e.g., PHIL101"
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Term <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.term}
                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                placeholder="e.g., Fall 2024"
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Description <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the course..."
              rows={3}
              className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Creating...' : 'Create Course'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// Course Settings Modal
interface CourseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  onUpdate: () => void;
}

function CourseSettingsModal({ isOpen, onClose, course, onUpdate }: CourseSettingsModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    courseCode: '',
    term: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (course) {
      setFormData({
        name: course.name || '',
        courseCode: course.courseCode || '',
        term: course.term || '',
        description: '',
      });
    }
  }, [course]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    setError('');

    if (!formData.name.trim() || !formData.courseCode.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/context/courses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: course.id, ...formData }),
      });
      const data = await res.json();

      if (data.success) {
        onUpdate();
        onClose();
      } else {
        setError(data.error || 'Failed to update course');
      }
    } catch {
      setError('Failed to update course. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!course) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/context/courses?id=${course.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        onUpdate();
        onClose();
        // Redirect to course list
        window.location.href = '/courses';
      } else {
        setError(data.error || 'Failed to delete course');
      }
    } catch {
      setError('Failed to delete course. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen || !course) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Course Settings</h2>
            <p className="text-sm text-surface-500">Edit course details or delete</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Course Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Introduction to Philosophy"
              className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Course Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.courseCode}
                onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                placeholder="e.g., PHIL 101"
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Term
              </label>
              <input
                type="text"
                value={formData.term}
                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                placeholder="e.g., Spring 2026"
                className="w-full px-4 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Danger Zone */}
          <div className="pt-4 border-t border-surface-200">
            <h4 className="text-sm font-medium text-red-600 mb-2">Danger Zone</h4>
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                Delete Course
              </button>
            ) : (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 mb-3">
                  Are you sure? This will delete the course and all associated assignments. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-sm text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                    Delete Forever
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CoursesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('courseId');
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBatchWizard, setShowBatchWizard] = useState(false);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCoursesAndBatches = async (selectCourseId?: string) => {
    try {
      // Fetch courses and batches in parallel (no-store so list and detail stay in sync)
      const [coursesRes, batchesRes] = await Promise.all([
        fetch('/api/context/courses', { cache: 'no-store' }),
        fetch('/api/bulk/batches', { cache: 'no-store' }),
      ]);
      
      const coursesData = await coursesRes.json();
      const batchesData = await batchesRes.json();

      if (coursesData.success && coursesData.courses && coursesData.courses.length > 0) {
        // Create a map of courseId -> batches
        const batchesByCourse: Record<string, Assignment[]> = {};
        const allBatches = batchesData.batches || [];
        
        for (const batch of allBatches) {
          if (batch.courseId) {
            if (!batchesByCourse[batch.courseId]) {
              batchesByCourse[batch.courseId] = [];
            }
            
            // GRADING STATUS: Use batch.status which is synced from actual grade data
            // Status is computed in /api/bulk/status from submission-level overallScore
            // Only mark "completed" if batch.status === 'completed' (all have grades)
            let status: Assignment['status'] = 'not_started';
            if (batch.status === 'completed') {
              status = 'completed';
            } else if (batch.status === 'processing' || batch.processedCount > 0) {
              status = 'in_progress';
            }
            
            // Calculate class average if available
            const classAverage = batch.averageScore ? Math.round(batch.averageScore) : undefined;
            
            batchesByCourse[batch.courseId].push({
              id: batch.id,
              name: batch.name,
              status,
              classAverage,
              totalSubmissions: batch.totalSubmissions || 0,
              gradedCount: batch.processedCount || 0,
              gradientClass: assignmentGradients[batchesByCourse[batch.courseId].length % assignmentGradients.length],
            });
          }
        }

        // Map API courses to our format with their assignments
        const mappedCourses: Course[] = coursesData.courses.map((c: { id: string; name: string; courseCode?: string; term?: string }) => {
          const courseAssignments = batchesByCourse[c.id] || [];
          const totalSubmissions = courseAssignments.reduce((sum, a) => sum + a.totalSubmissions, 0);
          
          return {
            id: c.id,
            name: c.name,
            courseCode: c.courseCode,
            term: c.term,
            section: '',
            assignments: courseAssignments,
            totalSubmissions,
          };
        });
        
        setCourses(mappedCourses);
        
        // Auto-select: explicit selectCourseId > URL param > existing selection
        if (selectCourseId) {
          const newCourse = mappedCourses.find(c => c.id === selectCourseId);
          if (newCourse) {
            setSelectedCourse(newCourse);
          }
        } else if (courseIdParam) {
          const courseFromParam = mappedCourses.find(c => c.id === courseIdParam);
          if (courseFromParam) {
            setSelectedCourse(courseFromParam);
          }
        } else if (selectedCourse) {
          const updatedCourse = mappedCourses.find(c => c.id === selectedCourse.id);
          if (updatedCourse) {
            setSelectedCourse(updatedCourse);
          }
        }
      } else {
        // Use mock data
        setCourses(mockCourses);
      }
    } catch {
      setCourses(mockCourses);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoursesAndBatches();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  // Course list view if no course selected or multiple courses
  if (!selectedCourse) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-surface-900">Your Courses</h1>
              <p className="text-surface-500 mt-1">Select a course to view assignments and grades</p>
            </div>
            <button 
              onClick={() => setShowCreateCourse(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Course
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative bg-white rounded-2xl border border-surface-200 p-6 text-left hover:shadow-lg hover:border-primary-200 transition-all cursor-pointer"
                onClick={() => setSelectedCourse(course)}
              >
                {/* Delete button - top right, visible on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCourseToDelete(course);
                  }}
                  className="absolute top-4 right-4 p-2 rounded-lg text-surface-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                  title="Delete course"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-surface-900 mb-1">{course.name}</h3>
                <p className="text-sm text-surface-500">{course.term}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-surface-600">
                  <span>{course.assignments.length} Assignments</span>
                  <span>{course.totalSubmissions} Submissions</span>
                </div>
              </motion.div>
            ))}

            {/* Add Course Card */}
            <button 
              onClick={() => setShowCreateCourse(true)}
              className="bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-6 flex flex-col items-center justify-center hover:border-primary-300 hover:bg-primary-50/30 transition-all min-h-[200px]"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mb-3">
                <Plus className="w-6 h-6 text-surface-400" />
              </div>
              <p className="font-medium text-surface-700">Add New Course</p>
              <p className="text-sm text-surface-500">Import from LMS or create manually</p>
            </button>
          </div>
        </div>

        {/* Create Course Modal */}
        <CreateCourseModal
          isOpen={showCreateCourse}
          onClose={() => setShowCreateCourse(false)}
          onSuccess={(newCourseId) => loadCoursesAndBatches(newCourseId)}
        />

        {/* Delete Course Confirmation Modal */}
        {courseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !isDeleting && setCourseToDelete(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 text-center">
                {/* Warning Icon */}
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-surface-900 mb-2">Delete Course</h3>
                <p className="text-sm text-surface-500 mb-1">
                  Are you sure you want to delete <span className="font-medium text-surface-700">{courseToDelete.name}</span>?
                </p>
                <p className="text-xs text-surface-400 mb-6">
                  This will permanently remove the course and all {courseToDelete.assignments.length} assignment{courseToDelete.assignments.length !== 1 ? 's' : ''}. This action cannot be undone.
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCourseToDelete(null)}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        const res = await fetch(`/api/context/courses?id=${courseToDelete.id}`, {
                          method: 'DELETE',
                        });
                        const data = await res.json();
                        if (data.success) {
                          setCourses(prev => prev.filter(c => c.id !== courseToDelete.id));
                          setCourseToDelete(null);
                        } else {
                          alert('Failed to delete course: ' + (data.error || 'Unknown error'));
                        }
                      } catch {
                        alert('Failed to delete course. Please try again.');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isDeleting ? 'Deleting...' : 'Delete Course'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // Course detail view
  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-surface-500 mb-4">
          <button onClick={() => setSelectedCourse(null)} className="hover:text-primary-600">
            Courses
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-surface-900 font-medium">{selectedCourse.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">{selectedCourse.name}</h1>
            <p className="text-surface-500 mt-1">
              {selectedCourse.term}
              {selectedCourse.section && ` · ${selectedCourse.section}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/courses/${selectedCourse.id}/content`}
              className="flex items-center gap-2 px-4 py-2 text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 text-sm font-medium"
            >
              <Library className="w-4 h-4" />
              Manage Resources
            </Link>
          </div>
        </div>

        {/* Section Title */}
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Assignments</h2>

        {/* Content */}
        <div className="flex gap-6">
          {/* Assignments Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {selectedCourse.assignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  courseId={selectedCourse.id}
                  courseName={selectedCourse.name}
                  onDelete={(deletedId) => {
                    // Remove the deleted assignment from the local state
                    setSelectedCourse(prev => prev ? {
                      ...prev,
                      assignments: prev.assignments.filter(a => a.id !== deletedId),
                      totalSubmissions: prev.totalSubmissions - (assignment.totalSubmissions || 0),
                    } : null);
                    // Also update the courses list
                    setCourses(prev => prev.map(c => 
                      c.id === selectedCourse.id 
                        ? { 
                            ...c, 
                            assignments: c.assignments.filter(a => a.id !== deletedId),
                            totalSubmissions: c.totalSubmissions - (assignment.totalSubmissions || 0),
                          }
                        : c
                    ));
                  }}
                />
              ))}

              {/* Add Assignment Card */}
              <button
                onClick={() => setShowBatchWizard(true)}
                className="bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-8 flex flex-col items-center justify-center hover:border-primary-300 hover:bg-primary-50/30 transition-all min-h-[250px]"
              >
                <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mb-3">
                  <Plus className="w-6 h-6 text-surface-400" />
                </div>
                <p className="font-medium text-surface-700">Create Assignment</p>
                <p className="text-sm text-surface-500 text-center mt-1">
                  Add rubric and start grading
                </p>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <p className="text-xs text-surface-400 text-center mt-8">
          © 2023 Babblet Grading Systems. All rights reserved.
        </p>

        {/* Batch Creation Wizard */}
        <BatchWizard
          isOpen={showBatchWizard}
          onClose={() => setShowBatchWizard(false)}
          onComplete={async (batchId, expectedFileCount) => {
            setShowBatchWizard(false);
            // Navigate immediately - don't wait for refresh
            const courseId = selectedCourse?.id || 'unknown';
            // Pass expected file count so assignment page can show upload progress
            const uploadParam = expectedFileCount ? `?uploading=${expectedFileCount}` : '';
            router.push(`/bulk/class/${courseId}/assignment/${batchId}/batch/${batchId}${uploadParam}`);
            // Refresh course data in background
            loadCoursesAndBatches();
          }}
          courses={courses.map(c => ({ id: c.id, name: c.courseCode ? `${c.courseCode} - ${c.name}` : c.name }))}
          defaultCourseId={selectedCourse?.id}
        />
      </div>
    </DashboardLayout>
  );
}

// Wrap in Suspense for useSearchParams
export default function CoursesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </DashboardLayout>
    }>
      <CoursesContent />
    </Suspense>
  );
}
