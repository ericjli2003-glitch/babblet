'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Library, BookOpen, ChevronRight, Loader2, Plus, FileText,
  Presentation, Book, Video, FolderOpen, Sparkles
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

// ============================================
// Types
// ============================================

interface Course {
  id: string;
  name: string;
  courseCode: string;
  term: string;
}

interface DocumentCount {
  courseId: string;
  total: number;
  byType: Record<string, number>;
}

// ============================================
// Main Component
// ============================================

export default function ResourcesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [documentCounts, setDocumentCounts] = useState<Record<string, DocumentCount>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load courses
      const coursesRes = await fetch('/api/context/courses');
      const coursesData = await coursesRes.json();

      if (coursesData.success && coursesData.courses) {
        setCourses(coursesData.courses);

        // Load document counts for each course
        const countsPromises = coursesData.courses.map(async (course: Course) => {
          try {
            const docsRes = await fetch(`/api/context/documents?courseId=${course.id}`);
            const docsData = await docsRes.json();
            const docs = docsData.documents || [];

            const byType: Record<string, number> = {};
            for (const doc of docs) {
              byType[doc.type] = (byType[doc.type] || 0) + 1;
            }

            return {
              courseId: course.id,
              count: {
                courseId: course.id,
                total: docs.length,
                byType,
              },
            };
          } catch {
            return { courseId: course.id, count: { courseId: course.id, total: 0, byType: {} } };
          }
        });

        const counts = await Promise.all(countsPromises);
        const countsMap: Record<string, DocumentCount> = {};
        for (const c of counts) {
          countsMap[c.courseId] = c.count;
        }
        setDocumentCounts(countsMap);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <Library className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900">Resources</h1>
              <p className="text-surface-500">Manage course materials to improve grading accuracy</p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-2xl border border-primary-200 p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-900 mb-1">Smart Context Library</h3>
              <p className="text-primary-700 text-sm leading-relaxed">
                Upload your course materials — slides, readings, lecture notes, and recordings — so Babblet can provide 
                feedback that&apos;s specific to what you&apos;ve taught. The more context you provide, the more accurate and 
                relevant the grading becomes.
              </p>
            </div>
          </div>
        </div>

        {/* Course List */}
        {courses.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-surface-900">Select a Course</h2>
            <div className="grid gap-4">
              {courses.map((course) => {
                const counts = documentCounts[course.id] || { total: 0, byType: {} };
                
                return (
                  <Link key={course.id} href={`/courses/${course.id}/content`}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl border border-surface-200 p-5 hover:shadow-lg hover:border-primary-200 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>

                        {/* Course Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-surface-900 group-hover:text-primary-600 transition-colors">
                            {course.name}
                          </h3>
                          <p className="text-sm text-surface-500">
                            {course.courseCode} • {course.term}
                          </p>
                        </div>

                        {/* Material Counts */}
                        <div className="flex items-center gap-4">
                          {counts.total > 0 ? (
                            <div className="flex items-center gap-3 text-sm text-surface-500">
                              {counts.byType.slides && (
                                <span className="flex items-center gap-1">
                                  <Presentation className="w-4 h-4 text-amber-500" />
                                  {counts.byType.slides}
                                </span>
                              )}
                              {counts.byType.reading && (
                                <span className="flex items-center gap-1">
                                  <Book className="w-4 h-4 text-emerald-500" />
                                  {counts.byType.reading}
                                </span>
                              )}
                              {counts.byType.lecture_notes && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-4 h-4 text-blue-500" />
                                  {counts.byType.lecture_notes}
                                </span>
                              )}
                              {counts.byType.recording && (
                                <span className="flex items-center gap-1">
                                  <Video className="w-4 h-4 text-pink-500" />
                                  {counts.byType.recording}
                                </span>
                              )}
                              <span className="text-surface-400">
                                {counts.total} total
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-surface-400">No materials yet</span>
                          )}
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 text-surface-300 group-hover:text-primary-500 transition-colors" />
                      </div>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 p-12 text-center">
            <FolderOpen className="w-16 h-16 text-surface-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-surface-900 mb-2">No Courses Yet</h3>
            <p className="text-surface-500 mb-6">
              Create a course first to start uploading materials
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Go to Courses
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
