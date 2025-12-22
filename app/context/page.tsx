'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, BookOpen, FileText, ClipboardList, Save,
  Trash2, ChevronRight, Loader2, CheckCircle, Camera, Edit3,
  GraduationCap, Calendar, Hash, Upload, File, AlertTriangle,
  ChevronUp, ChevronDown, RefreshCw, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// ============================================
// Types
// ============================================

interface Course {
  id: string;
  name: string;
  courseCode: string;
  term: string;
  description?: string;
  createdAt: number;
}

interface Assignment {
  id: string;
  courseId: string;
  name: string;
  instructions: string;
  rubricId?: string;
  createdAt: number;
}

interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  requiredEvidenceTypes?: string[];
  confidence?: 'high' | 'medium' | 'low';
  originalText?: string;
  levels?: Array<{
    score: number;
    label: string;
    description: string;
  }>;
}

interface Rubric {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  rawText?: string;
  sourceType?: 'text' | 'pdf';
  overallConfidence?: 'high' | 'medium' | 'low';
  totalPoints?: number;
  version: number;
}

interface BundleVersion {
  id: string;
  version: number;
  createdAt: number;
}

// ============================================
// Main Component (wrapped in Suspense for useSearchParams)
// ============================================

function CourseContextPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('courseId');
  const assignmentIdParam = searchParams.get('assignmentId');

  // View state
  const [view, setView] = useState<'list' | 'course' | 'assignment'>('list');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected items
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [latestVersion, setLatestVersion] = useState<BundleVersion | null>(null);

  // Create course form
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTerm, setNewCourseTerm] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Create assignment form
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [newAssignmentName, setNewAssignmentName] = useState('');
  const [newAssignmentInstructions, setNewAssignmentInstructions] = useState('');
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // Rubric editing - new two-mode flow
  const [rubricInputMode, setRubricInputMode] = useState<'paste' | 'pdf'>('paste');
  const [rubricText, setRubricText] = useState('');
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [parsingRubric, setParsingRubric] = useState(false);
  const [rubricParseWarnings, setRubricParseWarnings] = useState<string[]>([]);
  const [rubricOverallConfidence, setRubricOverallConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [rubricTotalPoints, setRubricTotalPoints] = useState<number | undefined>(undefined);
  const [editedCriteria, setEditedCriteria] = useState<RubricCriterion[]>([]);
  const [showRubricReview, setShowRubricReview] = useState(false);
  const [savingRubric, setSavingRubric] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const rubricFileInputRef = useRef<HTMLInputElement>(null);

  // Documents
  interface CourseDocument {
    id: string;
    name: string;
    type: string;
    createdAt: number;
  }
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<string>('lecture_notes');
  const [newDocText, setNewDocText] = useState('');
  const [addingDocument, setAddingDocument] = useState(false);
  const [uploadMode, setUploadMode] = useState<'paste' | 'file'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================
  // Load Courses
  // ============================================

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/context/courses');
      const data = await res.json();
      if (data.success) {
        setCourses(data.courses || []);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // Handle URL params
  useEffect(() => {
    if (courseIdParam && courses.length > 0) {
      const course = courses.find(c => c.id === courseIdParam);
      if (course) {
        selectCourse(course);
        if (assignmentIdParam) {
          // Will be handled after assignments load
        }
      }
    }
  }, [courseIdParam, assignmentIdParam, courses]);

  // ============================================
  // Course Operations
  // ============================================

  const createCourse = async () => {
    if (!newCourseName.trim() || !newCourseCode.trim() || !newCourseTerm.trim()) return;

    try {
      setCreatingCourse(true);
      const res = await fetch('/api/context/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCourseName.trim(),
          courseCode: newCourseCode.trim(),
          term: newCourseTerm.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCourses(prev => [data.course, ...prev]);
        setShowCreateCourse(false);
        setNewCourseName('');
        setNewCourseCode('');
        setNewCourseTerm('');
        selectCourse(data.course);
      }
    } catch (error) {
      console.error('Failed to create course:', error);
    } finally {
      setCreatingCourse(false);
    }
  };

  const selectCourse = async (course: Course) => {
    setSelectedCourse(course);
    setView('course');
    
    // Load assignments
    try {
      const res = await fetch(`/api/context/assignments?courseId=${course.id}`);
      const data = await res.json();
      if (data.success) {
        setAssignments(data.assignments || []);
      }
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const deleteCourse = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this course and all its assignments?')) return;

    try {
      await fetch(`/api/context/courses?id=${courseId}`, { method: 'DELETE' });
      setCourses(prev => prev.filter(c => c.id !== courseId));
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
        setView('list');
      }
    } catch (error) {
      console.error('Failed to delete course:', error);
    }
  };

  // ============================================
  // Assignment Operations
  // ============================================

  const createAssignment = async () => {
    if (!selectedCourse || !newAssignmentName.trim() || !newAssignmentInstructions.trim()) return;

    try {
      setCreatingAssignment(true);
      const res = await fetch('/api/context/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          name: newAssignmentName.trim(),
          instructions: newAssignmentInstructions.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAssignments(prev => [data.assignment, ...prev]);
        setShowCreateAssignment(false);
        setNewAssignmentName('');
        setNewAssignmentInstructions('');
        selectAssignment(data.assignment);
      }
    } catch (error) {
      console.error('Failed to create assignment:', error);
    } finally {
      setCreatingAssignment(false);
    }
  };

  const selectAssignment = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setView('assignment');

    // Load rubric, bundle info, and documents
    try {
      const res = await fetch(`/api/context/assignments?id=${assignment.id}`);
      const data = await res.json();
      if (data.success) {
        if (data.assignment.rubricId) {
          const rubricRes = await fetch(`/api/context/rubrics?id=${data.assignment.rubricId}`);
          const rubricData = await rubricRes.json();
          if (rubricData.success) {
            setRubric(rubricData.rubric);
            setEditedCriteria(rubricData.rubric.criteria);
            setRubricText(rubricData.rubric.rawText || '');
          }
        } else {
          setRubric(null);
          setEditedCriteria([]);
          setRubricText('');
        }
        setLatestVersion(data.latestVersion);
      }

      // Load documents for this assignment and course
      const docsRes = await fetch(`/api/context/documents?assignmentId=${assignment.id}`);
      const docsData = await docsRes.json();
      const courseDocsRes = await fetch(`/api/context/documents?courseId=${assignment.courseId}`);
      const courseDocsData = await courseDocsRes.json();
      
      const allDocs = [
        ...(docsData.documents || []),
        ...(courseDocsData.documents || []),
      ];
      setDocuments(allDocs);
    } catch (error) {
      console.error('Failed to load assignment details:', error);
    }
  };

  // ============================================
  // Rubric Operations - AI-powered parsing
  // ============================================

  const parseRubric = async () => {
    // Validate input based on mode
    if (rubricInputMode === 'paste' && !rubricText.trim()) return;
    if (rubricInputMode === 'pdf' && !rubricFile) return;

    try {
      setParsingRubric(true);
      setRubricParseWarnings([]);
      setRubricOverallConfidence(null);
      
      let response: Response;
      
      if (rubricInputMode === 'pdf' && rubricFile) {
        // PDF mode - use FormData
        const formData = new FormData();
        formData.append('file', rubricFile);
        
        response = await fetch('/api/context/parse-rubric', {
          method: 'POST',
          body: formData,
        });
      } else {
        // Text mode - use JSON
        response = await fetch('/api/context/parse-rubric', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rubricText }),
        });
      }
      
      const data = await response.json();
      
      if (!data.success) {
        alert(data.error || 'Failed to parse rubric');
        return;
      }
      
      // Update state with parsed results
      setEditedCriteria(data.criteria);
      setRubricParseWarnings(data.warnings || []);
      setRubricOverallConfidence(data.overallConfidence);
      setRubricTotalPoints(data.totalPoints);
      
      // Store raw text if we extracted from PDF
      if (rubricInputMode === 'pdf' && data.rawText) {
        setRubricText(data.rawText);
      }
      
      // Show review UI
      setShowRubricReview(true);
      
    } catch (error) {
      console.error('Failed to parse rubric:', error);
      alert('Failed to parse rubric. Please try again.');
    } finally {
      setParsingRubric(false);
    }
  };

  const handleRubricFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file');
        return;
      }
      setRubricFile(file);
    }
  };

  const resetRubricInput = () => {
    setShowRubricReview(false);
    setEditedCriteria([]);
    setRubricParseWarnings([]);
    setRubricOverallConfidence(null);
    setRubricTotalPoints(undefined);
  };

  const reorderCriteria = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= editedCriteria.length) return;
    
    const newCriteria = [...editedCriteria];
    [newCriteria[fromIndex], newCriteria[toIndex]] = [newCriteria[toIndex], newCriteria[fromIndex]];
    setEditedCriteria(newCriteria);
  };

  const saveRubric = async () => {
    if (!selectedCourse || !selectedAssignment || editedCriteria.length === 0) return;

    try {
      setSavingRubric(true);

      const rubricData = {
        criteria: editedCriteria,
        rawText: rubricText,
        sourceType: rubricInputMode,
        overallConfidence: rubricOverallConfidence,
        totalPoints: rubricTotalPoints,
      };

      if (rubric) {
        // Update existing rubric
        const res = await fetch('/api/context/rubrics', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rubricId: rubric.id,
            ...rubricData,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRubric(data.rubric);
        }
      } else {
        // Create new rubric
        const res = await fetch('/api/context/rubrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: selectedCourse.id,
            assignmentId: selectedAssignment.id,
            name: `${selectedAssignment.name} Rubric`,
            ...rubricData,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRubric(data.rubric);
        }
      }
    } catch (error) {
      console.error('Failed to save rubric:', error);
    } finally {
      setSavingRubric(false);
    }
  };

  const updateCriterion = (id: string, updates: Partial<RubricCriterion>) => {
    setEditedCriteria(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCriterion = (id: string) => {
    if (editedCriteria.length <= 1) {
      alert('You must have at least one criterion');
      return;
    }
    setEditedCriteria(prev => prev.filter(c => c.id !== id));
  };

  // ============================================
  // Document Operations
  // ============================================

  const addDocument = async () => {
    if (!selectedCourse) return;

    // Validate based on mode
    if (uploadMode === 'file' && !selectedFile) return;
    if (uploadMode === 'paste' && (!newDocName.trim() || !newDocText.trim())) return;

    try {
      setAddingDocument(true);

      let data;

      if (uploadMode === 'file' && selectedFile) {
        // File upload mode - use FormData
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('courseId', selectedCourse.id);
        if (selectedAssignment) {
          formData.append('assignmentId', selectedAssignment.id);
        }
        formData.append('type', newDocType);

        const res = await fetch('/api/context/upload-document', {
          method: 'POST',
          body: formData,
        });
        data = await res.json();
      } else {
        // Paste mode
        const res = await fetch('/api/context/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: selectedCourse.id,
            assignmentId: selectedAssignment?.id,
            name: newDocName.trim(),
            type: newDocType,
            rawText: newDocText.trim(),
          }),
        });
        data = await res.json();
      }

      if (data.success) {
        setDocuments(prev => [data.document, ...prev]);
        setShowAddDocument(false);
        setNewDocName('');
        setNewDocType('lecture_notes');
        setNewDocText('');
        setSelectedFile(null);
        const msg = uploadMode === 'file'
          ? `Document uploaded! Extracted ${data.document.wordCount || 0} words, created ${data.chunkCount} chunks.`
          : `Document added! ${data.chunkCount} chunks created with embeddings.`;
        alert(msg);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to add document:', error);
      alert('Failed to add document. Please try again.');
    } finally {
      setAddingDocument(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-set doc name from filename if empty
      if (!newDocName) {
        const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
        setNewDocName(nameWithoutExt);
      }
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    
    try {
      await fetch(`/api/context/documents?id=${docId}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  // ============================================
  // Snapshot Operations
  // ============================================

  const createSnapshot = async () => {
    if (!selectedAssignment) return;

    try {
      setCreatingSnapshot(true);
      
      // Save rubric first if changed
      await saveRubric();

      // Create snapshot
      const res = await fetch('/api/context/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: selectedAssignment.id }),
      });
      const data = await res.json();
      if (data.success) {
        setLatestVersion(data.version);
        alert(`Snapshot v${data.version.version} created! This context will be used for grading.`);
      }
    } catch (error) {
      console.error('Failed to create snapshot:', error);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  // ============================================
  // Navigation
  // ============================================

  const goBack = () => {
    if (view === 'assignment') {
      setView('course');
      setSelectedAssignment(null);
      setRubric(null);
      setEditedCriteria([]);
    } else if (view === 'course') {
      setView('list');
      setSelectedCourse(null);
      setAssignments([]);
    }
  };

  const goToBulkUpload = () => {
    if (selectedAssignment && latestVersion) {
      router.push(`/bulk?assignmentId=${selectedAssignment.id}&versionId=${latestVersion.id}`);
    } else {
      alert('Please create a snapshot first before uploading submissions.');
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-surface-100 to-primary-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-surface-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {view !== 'list' ? (
                <button onClick={goBack} className="flex items-center gap-2 text-surface-600 hover:text-surface-900">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm">Back</span>
                </button>
              ) : (
                <Link href="/" className="flex items-center gap-2 text-surface-600 hover:text-surface-900">
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm">Home</span>
                </Link>
              )}
              <div className="h-6 w-px bg-surface-200" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent">
                {view === 'list' && 'Course Notebooks'}
                {view === 'course' && selectedCourse?.name}
                {view === 'assignment' && selectedAssignment?.name}
              </h1>
            </div>

            {view === 'assignment' && (
              <div className="flex items-center gap-2">
                {latestVersion && (
                  <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    Context v{latestVersion.version} active
                  </span>
                )}
                <button
                  onClick={goToBulkUpload}
                  disabled={!latestVersion}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                >
                  <GraduationCap className="w-4 h-4" />
                  Grade Submissions
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Courses List */}
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <p className="text-surface-600">
                  Manage rubrics, assignments, and course materials for AI grading
                </p>
                <button
                  onClick={() => setShowCreateCourse(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
                >
                  <Plus className="w-5 h-5" />
                  New Course
                </button>
              </div>

              {/* Create Course Form */}
              {showCreateCourse && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 mb-6"
                >
                  <h3 className="font-semibold text-surface-900 mb-4">Create New Course</h3>
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <input
                      type="text"
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      placeholder="Course Name (e.g., Public Speaking)"
                      className="px-4 py-2 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      placeholder="Course Code (e.g., COMM 101)"
                      className="px-4 py-2 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="text"
                      value={newCourseTerm}
                      onChange={(e) => setNewCourseTerm(e.target.value)}
                      placeholder="Term (e.g., Fall 2025)"
                      className="px-4 py-2 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowCreateCourse(false)}
                      className="px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createCourse}
                      disabled={!newCourseName.trim() || !newCourseCode.trim() || !newCourseTerm.trim() || creatingCourse}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {creatingCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Course List */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              ) : courses.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
                  <BookOpen className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">No courses yet</h3>
                  <p className="text-surface-600">Create your first course to start building grading context</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {courses.map(course => (
                    <motion.div
                      key={course.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => selectCourse(course)}
                      className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 hover:shadow-md cursor-pointer transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-primary-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-surface-900">{course.name}</h3>
                            <div className="flex items-center gap-3 text-sm text-surface-500">
                              <span className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                {course.courseCode}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {course.term}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => deleteCourse(course.id, e)}
                            className="p-2 text-surface-400 hover:text-red-500 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-5 h-5 text-surface-400" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Course Detail (Assignments) */}
          {view === 'course' && selectedCourse && (
            <motion.div
              key="course"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-surface-600">{selectedCourse.courseCode} • {selectedCourse.term}</p>
                </div>
                <button
                  onClick={() => setShowCreateAssignment(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
                >
                  <Plus className="w-5 h-5" />
                  New Assignment
                </button>
              </div>

              {/* Create Assignment Form */}
              {showCreateAssignment && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6 mb-6"
                >
                  <h3 className="font-semibold text-surface-900 mb-4">Create New Assignment</h3>
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={newAssignmentName}
                      onChange={(e) => setNewAssignmentName(e.target.value)}
                      placeholder="Assignment Name (e.g., Persuasive Speech)"
                      className="w-full px-4 py-2 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500"
                    />
                    <textarea
                      value={newAssignmentInstructions}
                      onChange={(e) => setNewAssignmentInstructions(e.target.value)}
                      placeholder="Assignment instructions and requirements..."
                      rows={4}
                      className="w-full px-4 py-2 rounded-lg border border-surface-300 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => setShowCreateAssignment(false)}
                      className="px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createAssignment}
                      disabled={!newAssignmentName.trim() || !newAssignmentInstructions.trim() || creatingAssignment}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {creatingAssignment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Assignment List */}
              {assignments.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-12 text-center">
                  <ClipboardList className="w-16 h-16 text-surface-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">No assignments yet</h3>
                  <p className="text-surface-600">Create an assignment to add rubrics and grading context</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignments.map(assignment => (
                    <motion.div
                      key={assignment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => selectAssignment(assignment)}
                      className="bg-white rounded-xl shadow-sm border border-surface-200 p-5 hover:shadow-md cursor-pointer transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                            <ClipboardList className="w-6 h-6 text-violet-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-surface-900">{assignment.name}</h3>
                            <p className="text-sm text-surface-500 line-clamp-1">
                              {assignment.instructions.slice(0, 100)}...
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {assignment.rubricId && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                              Rubric ✓
                            </span>
                          )}
                          <ChevronRight className="w-5 h-5 text-surface-400" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Assignment Detail (Rubric Editor) */}
          {view === 'assignment' && selectedAssignment && (
            <motion.div
              key="assignment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Assignment Info */}
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <h3 className="font-semibold text-surface-900 mb-2">Assignment Instructions</h3>
                <p className="text-surface-600 whitespace-pre-wrap">{selectedAssignment.instructions}</p>
              </div>

              {/* Rubric Editor - Two Mode Flow */}
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-surface-900">Grading Rubric</h3>
                    {rubricOverallConfidence && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        rubricOverallConfidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                        rubricOverallConfidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {rubricOverallConfidence === 'high' ? '✓ High confidence' :
                         rubricOverallConfidence === 'medium' ? '⚠ Medium confidence' :
                         '⚠ Low confidence'}
                      </span>
                    )}
                  </div>
                  {showRubricReview && editedCriteria.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveRubric}
                        disabled={savingRubric}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 disabled:opacity-50"
                      >
                        {savingRubric ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        onClick={createSnapshot}
                        disabled={creatingSnapshot || (rubricOverallConfidence === 'low' && !window.confirm('The rubric extraction has low confidence. Are you sure you want to create a snapshot?'))}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        {creatingSnapshot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        Create Snapshot
                      </button>
                    </div>
                  )}
                </div>

                {/* Warnings Banner */}
                {rubricParseWarnings.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium mb-1">Please review:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {rubricParseWarnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Input Mode Selection - Only shown when not in review */}
                {!showRubricReview && (
                  <>
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setRubricInputMode('paste')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          rubricInputMode === 'paste'
                            ? 'bg-primary-600 text-white shadow-md'
                            : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        Paste Rubric Text
                      </button>
                      <button
                        onClick={() => setRubricInputMode('pdf')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          rubricInputMode === 'pdf'
                            ? 'bg-primary-600 text-white shadow-md'
                            : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        Upload Rubric PDF
                      </button>
                    </div>

                    {/* Paste Mode */}
                    {rubricInputMode === 'paste' && (
                      <div className="space-y-3">
                        <textarea
                          value={rubricText}
                          onChange={(e) => setRubricText(e.target.value)}
                          placeholder="Paste your rubric text here...

Example:
1. Content Quality - 30 pts
Clear thesis statement and logical organization

2. Evidence & Support - 25 pts  
Uses credible sources with proper citations

3. Delivery - 25 pts
Engaging presentation with good eye contact

4. Time Management - 20 pts
Presentation within time limits"
                          rows={8}
                          className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                        />
                        <button
                          onClick={parseRubric}
                          disabled={!rubricText.trim() || parsingRubric}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                        >
                          {parsingRubric ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Parsing with AI...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Parse Rubric
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* PDF Mode */}
                    {rubricInputMode === 'pdf' && (
                      <div className="space-y-3">
                        <input
                          ref={rubricFileInputRef}
                          type="file"
                          accept=".pdf"
                          onChange={handleRubricFileSelect}
                          className="hidden"
                        />
                        <div
                          onClick={() => rubricFileInputRef.current?.click()}
                          className="border-2 border-dashed border-primary-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-500 hover:bg-primary-50/50 transition-colors"
                        >
                          {rubricFile ? (
                            <div className="flex items-center justify-center gap-3">
                              <File className="w-10 h-10 text-primary-500" />
                              <div className="text-left">
                                <p className="font-medium text-surface-900">{rubricFile.name}</p>
                                <p className="text-sm text-surface-500">
                                  {(rubricFile.size / 1024).toFixed(1)} KB • Click to change
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-primary-400 mx-auto mb-3" />
                              <p className="text-surface-700 font-medium">
                                Click to upload your rubric PDF
                              </p>
                              <p className="text-sm text-surface-500 mt-1">
                                We'll extract and parse the criteria automatically
                              </p>
                            </>
                          )}
                        </div>
                        <button
                          onClick={parseRubric}
                          disabled={!rubricFile || parsingRubric}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                        >
                          {parsingRubric ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Extracting & Parsing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Extract & Parse Rubric
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Existing rubric indicator */}
                    {rubric && rubric.criteria.length > 0 && (
                      <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-sm font-medium">
                              Existing rubric: {rubric.criteria.length} criteria
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setEditedCriteria(rubric.criteria);
                              setRubricText(rubric.rawText || '');
                              setShowRubricReview(true);
                            }}
                            className="text-sm text-emerald-700 hover:text-emerald-800 underline"
                          >
                            Edit existing rubric
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Review & Confirm UI */}
                {showRubricReview && editedCriteria.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-medium text-surface-700">
                          Review Criteria ({editedCriteria.length})
                          {rubricTotalPoints && (
                            <span className="ml-2 text-surface-500">• {rubricTotalPoints} total points</span>
                          )}
                        </h4>
                      </div>
                      <button
                        onClick={resetRubricInput}
                        className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-700"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Start over
                      </button>
                    </div>

                    <p className="text-sm text-surface-500">
                      Review the extracted criteria below. You can rename, adjust weights, reorder, or remove items.
                    </p>

                    {editedCriteria.map((criterion, idx) => (
                      <div 
                        key={criterion.id} 
                        className={`p-4 rounded-xl border transition-colors ${
                          criterion.confidence === 'low' 
                            ? 'bg-red-50 border-red-200' 
                            : criterion.confidence === 'medium'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-surface-50 border-surface-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Order controls */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => reorderCriteria(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-surface-400 hover:text-surface-700 disabled:opacity-30"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </span>
                            <button
                              onClick={() => reorderCriteria(idx, 'down')}
                              disabled={idx === editedCriteria.length - 1}
                              className="p-1 text-surface-400 hover:text-surface-700 disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex-1 space-y-2">
                            {/* Confidence indicator */}
                            {criterion.confidence && criterion.confidence !== 'high' && (
                              <span className={`inline-block px-2 py-0.5 text-xs rounded-full mb-1 ${
                                criterion.confidence === 'low' 
                                  ? 'bg-red-100 text-red-700' 
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {criterion.confidence === 'low' ? '⚠ Low confidence - please verify' : '⚠ Medium confidence'}
                              </span>
                            )}
                            
                            <input
                              type="text"
                              value={criterion.name}
                              onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                              className="w-full font-medium text-surface-900 bg-white border border-surface-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary-500"
                              placeholder="Criterion name"
                            />
                            <textarea
                              value={criterion.description}
                              onChange={(e) => updateCriterion(criterion.id, { description: e.target.value })}
                              className="w-full text-sm text-surface-600 bg-white border border-surface-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 resize-none"
                              placeholder="Description of what this criterion evaluates..."
                              rows={2}
                            />
                            
                            {/* Score levels if present */}
                            {criterion.levels && criterion.levels.length > 0 && (
                              <div className="mt-2 p-2 bg-white/50 rounded-lg">
                                <p className="text-xs font-medium text-surface-500 mb-1">Score Levels:</p>
                                <div className="flex flex-wrap gap-2">
                                  {criterion.levels.map((level, levelIdx) => (
                                    <span key={levelIdx} className="px-2 py-1 bg-surface-100 rounded text-xs">
                                      {level.label}: {level.score} pts
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-xs text-surface-500">
                                Weight/Points:
                                <input
                                  type="number"
                                  value={criterion.weight}
                                  onChange={(e) => updateCriterion(criterion.id, { weight: parseInt(e.target.value) || 1 })}
                                  min={1}
                                  max={100}
                                  className="w-16 px-2 py-1 rounded border border-surface-300 text-center bg-white"
                                />
                              </label>
                            </div>

                            {/* Show original text for reference */}
                            {criterion.originalText && (
                              <details className="mt-2">
                                <summary className="text-xs text-surface-400 cursor-pointer hover:text-surface-600">
                                  View source text
                                </summary>
                                <p className="mt-1 text-xs text-surface-500 bg-white/50 p-2 rounded border border-surface-200 font-mono">
                                  {criterion.originalText}
                                </p>
                              </details>
                            )}
                          </div>
                          
                          <button
                            onClick={() => removeCriterion(criterion.id)}
                            className="p-1 text-surface-400 hover:text-red-500"
                            title="Remove criterion"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state - only shown when no review and no existing rubric */}
                {!showRubricReview && (!rubric || rubric.criteria.length === 0) && !parsingRubric && (
                  <div className="text-center py-6 text-surface-500 border-t border-surface-100 mt-4">
                    <ClipboardList className="w-10 h-10 text-surface-300 mx-auto mb-2" />
                    <p className="text-sm">
                      {rubricInputMode === 'paste' 
                        ? 'Paste your rubric text above and click "Parse Rubric"' 
                        : 'Upload your rubric PDF and click "Extract & Parse Rubric"'}
                    </p>
                    <p className="text-xs text-surface-400 mt-1">
                      Our AI will automatically extract and structure the criteria
                    </p>
                  </div>
                )}
              </div>

              {/* Course Materials */}
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-surface-900">Course Materials</h3>
                  <button
                    onClick={() => setShowAddDocument(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200"
                  >
                    <Plus className="w-4 h-4" />
                    Add Document
                  </button>
                </div>

                <p className="text-sm text-surface-500 mb-4">
                  Add lecture notes, readings, and other materials. The AI will use these to provide more accurate, context-aware feedback.
                </p>

                {/* Add Document Form */}
                {showAddDocument && (
                  <div className="p-4 bg-violet-50 rounded-xl border border-violet-200 mb-4">
                    <div className="space-y-4">
                      {/* Mode Toggle */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUploadMode('file')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                            uploadMode === 'file'
                              ? 'bg-violet-600 text-white'
                              : 'bg-white text-surface-600 border border-surface-300'
                          }`}
                        >
                          <Upload className="w-4 h-4" />
                          Upload File
                        </button>
                        <button
                          onClick={() => setUploadMode('paste')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                            uploadMode === 'paste'
                              ? 'bg-violet-600 text-white'
                              : 'bg-white text-surface-600 border border-surface-300'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          Paste Text
                        </button>
                      </div>

                      {/* File Upload Mode */}
                      {uploadMode === 'file' && (
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,.doc,.txt,.md"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-violet-300 rounded-xl p-6 text-center cursor-pointer hover:border-violet-500 hover:bg-violet-100/50 transition-colors"
                          >
                            {selectedFile ? (
                              <div className="flex items-center justify-center gap-3">
                                <File className="w-8 h-8 text-violet-500" />
                                <div className="text-left">
                                  <p className="font-medium text-surface-900">{selectedFile.name}</p>
                                  <p className="text-sm text-surface-500">
                                    {(selectedFile.size / 1024).toFixed(1)} KB • Click to change
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-violet-400 mx-auto mb-2" />
                                <p className="text-sm text-surface-600">
                                  Click to upload <span className="font-medium">PDF, DOCX, TXT, or MD</span>
                                </p>
                                <p className="text-xs text-surface-500 mt-1">
                                  Text will be automatically extracted
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Document Name & Type (shown for both modes) */}
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={newDocName}
                          onChange={(e) => setNewDocName(e.target.value)}
                          placeholder={uploadMode === 'file' ? 'Document name (auto-filled from file)' : 'Document name'}
                          className="flex-1 px-3 py-2 rounded-lg border border-violet-300 focus:ring-2 focus:ring-violet-500 text-sm"
                        />
                        <select
                          value={newDocType}
                          onChange={(e) => setNewDocType(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-violet-300 focus:ring-2 focus:ring-violet-500 text-sm"
                        >
                          <option value="lecture_notes">Lecture Notes</option>
                          <option value="reading">Reading</option>
                          <option value="slides">Slides</option>
                          <option value="policy">Policy</option>
                          <option value="example">Example</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      {/* Text Paste Mode */}
                      {uploadMode === 'paste' && (
                        <textarea
                          value={newDocText}
                          onChange={(e) => setNewDocText(e.target.value)}
                          placeholder="Paste document content here..."
                          rows={6}
                          className="w-full px-3 py-2 rounded-lg border border-violet-300 focus:ring-2 focus:ring-violet-500 text-sm font-mono"
                        />
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowAddDocument(false);
                            setSelectedFile(null);
                            setNewDocName('');
                            setNewDocText('');
                          }}
                          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addDocument}
                          disabled={
                            addingDocument ||
                            (uploadMode === 'file' && !selectedFile) ||
                            (uploadMode === 'paste' && (!newDocName.trim() || !newDocText.trim()))
                          }
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                        >
                          {addingDocument ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              {uploadMode === 'file' ? 'Upload & Extract' : 'Add Document'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document List */}
                {documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-violet-500" />
                          <div>
                            <p className="font-medium text-surface-900 text-sm">{doc.name}</p>
                            <p className="text-xs text-surface-500">{doc.type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteDoc(doc.id)}
                          className="p-1.5 text-surface-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-surface-500 text-sm">
                    No documents added yet. Add lecture notes or readings to improve AI grading.
                  </div>
                )}
              </div>

              {/* Version History */}
              {latestVersion && (
                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                    <div>
                      <p className="font-medium text-emerald-900">
                        Context Snapshot v{latestVersion.version} is active
                      </p>
                      <p className="text-sm text-emerald-700">
                        Created {new Date(latestVersion.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ============================================
// Default Export with Suspense Boundary
// ============================================

export default function CourseContextPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    }>
      <CourseContextPageContent />
    </Suspense>
  );
}
