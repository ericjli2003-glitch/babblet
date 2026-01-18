'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus, Settings, Download, ChevronRight, Users, TrendingUp,
  AlertCircle, Play, Eye, Loader2, BookOpen
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

function AssignmentCard({ assignment, courseId, courseName }: { assignment: Assignment; courseId: string; courseName?: string }) {
  const status = getStatusBadge(assignment.status);
  const progress = assignment.totalSubmissions > 0
    ? (assignment.gradedCount / assignment.totalSubmissions) * 100
    : 0;

  return (
    <Link href={`/bulk/class/${courseId}/assignment/${assignment.id}/batch/${assignment.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
      >
        {/* Card Header with Gradient */}
        <div className={`bg-gradient-to-br ${assignment.gradientClass} p-5 text-white`}>
          <div className="flex items-start justify-between mb-4">
            <h3 className="font-semibold text-lg">{assignment.name}</h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}>
              {status.label}
            </span>
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

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'assignments' | 'students' | 'analytics'>('assignments');
  const [showBatchWizard, setShowBatchWizard] = useState(false);

  const loadCoursesAndBatches = async () => {
    try {
      // Fetch courses and batches in parallel
      const [coursesRes, batchesRes] = await Promise.all([
        fetch('/api/context/courses'),
        fetch('/api/bulk/batches'),
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
            
            // Determine status based on batch data
            let status: Assignment['status'] = 'not_started';
            if (batch.processedCount > 0 && batch.processedCount >= batch.totalSubmissions && batch.totalSubmissions > 0) {
              status = 'completed';
            } else if (batch.processedCount > 0 || batch.status === 'processing') {
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
        
        // Update selected course if it exists
        if (selectedCourse) {
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
            <button className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium">
              <Plus className="w-4 h-4" />
              Create Course
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <motion.button
                key={course.id}
                onClick={() => setSelectedCourse(course)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-surface-200 p-6 text-left hover:shadow-lg hover:border-primary-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-surface-900 mb-1">{course.name}</h3>
                <p className="text-sm text-surface-500">{course.term}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-surface-600">
                  <span>{course.assignments.length} Assignments</span>
                  <span>{course.totalSubmissions} Submissions</span>
                </div>
              </motion.button>
            ))}

            {/* Add Course Card */}
            <button className="bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-6 flex flex-col items-center justify-center hover:border-primary-300 hover:bg-primary-50/30 transition-all min-h-[200px]">
              <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mb-3">
                <Plus className="w-6 h-6 text-surface-400" />
              </div>
              <p className="font-medium text-surface-700">Add New Course</p>
              <p className="text-sm text-surface-500">Import from LMS or create manually</p>
            </button>
          </div>
        </div>
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
            <button className="flex items-center gap-2 px-4 py-2 text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 text-sm font-medium">
              <Download className="w-4 h-4" />
              Export Report
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium">
              <Settings className="w-4 h-4" />
              Course Settings
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-surface-200 -mx-8 px-8">
          {(['assignments', 'students', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-primary-600 border-b-2 border-primary-500 -mb-px'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex gap-6">
          {/* Assignments Grid */}
          <div className="flex-1">
            {activeTab === 'assignments' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {selectedCourse.assignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    courseId={selectedCourse.id}
                    courseName={selectedCourse.name}
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
            )}

            {activeTab === 'students' && (
              <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center">
                <Users className="w-12 h-12 text-surface-300 mx-auto mb-4" />
                <h3 className="font-semibold text-surface-900 mb-2">Student Roster</h3>
                <p className="text-surface-500">Student management coming soon</p>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center">
                <TrendingUp className="w-12 h-12 text-surface-300 mx-auto mb-4" />
                <h3 className="font-semibold text-surface-900 mb-2">Course Analytics</h3>
                <p className="text-surface-500">Detailed analytics coming soon</p>
              </div>
            )}
          </div>

          {/* Quick Stats Sidebar */}
          <div className="w-80 flex-shrink-0">
            <QuickStats course={selectedCourse} />
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
          onComplete={async (batchId) => {
            setShowBatchWizard(false);
            // Refresh course data to show new assignment
            await loadCoursesAndBatches();
            // Navigate to the batch detail view
            router.push(`/bulk?batchId=${batchId}`);
          }}
          courses={courses.map(c => ({ id: c.id, name: c.courseCode ? `${c.courseCode} - ${c.name}` : c.name }))}
          defaultCourseId={selectedCourse?.id}
        />
      </div>
    </DashboardLayout>
  );
}
