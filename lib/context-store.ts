// ============================================
// Context Store for Class-Level Context System
// Uses Vercel KV for Stage 1 (will migrate to Postgres + pgvector in Stage 2)
// ============================================

import { kv } from '@vercel/kv';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface Course {
  id: string;
  name: string;
  courseCode: string;
  term: string; // e.g., "Fall 2025"
  description?: string;
  // AI-generated or manual summary for context fallback
  summary?: string;
  // Key themes/concepts for the course (used in retrieval fallback)
  keyThemes?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 1-5 or percentage
  levels?: Array<{
    score: number;
    label: string;
    description: string;
  }>;
  requiredEvidenceTypes?: string[]; // e.g., ["citation", "data", "example"]
  confidence?: 'high' | 'medium' | 'low'; // Extraction confidence
  originalText?: string; // Source text this was extracted from
}

// Grading scale types supported
export type GradingScaleType = 'points' | 'percentage' | 'letter' | 'bands' | 'none';

export interface GradingScale {
  type: GradingScaleType;
  maxScore?: number; // e.g., 100 for percentage, 50 for points
  // For letter grades
  letterGrades?: Array<{
    letter: string; // A, B, C, D, F
    minScore: number;
    maxScore: number;
  }>;
  // For bands
  bands?: Array<{
    label: string; // Excellent, Good, Fair, Poor
    minScore: number;
    maxScore: number;
  }>;
}

export interface Rubric {
  id: string;
  courseId: string;
  assignmentId?: string; // null = course-level default
  name: string;
  criteria: RubricCriterion[];
  rawText?: string; // Original pasted rubric text
  sourceType?: 'text' | 'pdf'; // How the rubric was provided
  overallConfidence?: 'high' | 'medium' | 'low'; // AI extraction confidence
  totalPoints?: number; // Total points if detected
  // Grading scale detection
  gradingScale?: GradingScale;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface Assignment {
  id: string;
  courseId: string;
  name: string;
  instructions: string;
  dueDate?: string;
  rubricId?: string;
  // Subject/level metadata (inferred or set by instructor)
  subjectArea?: string; // e.g., "Microeconomics", "Public Speaking", "Biology"
  academicLevel?: string; // e.g., "Undergraduate", "Graduate", "High School"
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  courseId: string;
  assignmentId?: string; // null = course-level
  name: string;
  type: 'lecture_notes' | 'reading' | 'slides' | 'policy' | 'example' | 'other';
  fileKey?: string; // R2 key if uploaded
  rawText: string;
  createdAt: number;
}

export interface Bundle {
  id: string;
  courseId: string;
  assignmentId: string;
  name: string;
  description?: string;
  // References to included content
  rubricId: string;
  documentIds: string[];
  // Evaluation guidance
  evaluationGuidance?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BundleVersion {
  id: string;
  bundleId: string;
  version: number;
  // Snapshot of all content at this version (immutable)
  snapshot: {
    rubric: Rubric;
    assignment: Assignment;
    documents: Document[];
    evaluationGuidance?: string;
  };
  createdAt: number;
  createdBy?: string; // professor ID/email
}

// ============================================
// KV Keys
// ============================================

const COURSE_PREFIX = 'course:';
const ASSIGNMENT_PREFIX = 'assignment:';
const RUBRIC_PREFIX = 'rubric:';
const DOCUMENT_PREFIX = 'document:';
const BUNDLE_PREFIX = 'bundle:';
const BUNDLE_VERSION_PREFIX = 'bundle_version:';

const ALL_COURSES_KEY = 'all_courses';
const COURSE_ASSIGNMENTS_PREFIX = 'course_assignments:';
const COURSE_DOCUMENTS_PREFIX = 'course_documents:';
const ASSIGNMENT_DOCUMENTS_PREFIX = 'assignment_documents:';
const BUNDLE_VERSIONS_PREFIX = 'bundle_versions:';

// ============================================
// Course Operations
// ============================================

export async function createCourse(params: {
  name: string;
  courseCode: string;
  term: string;
  description?: string;
}): Promise<Course> {
  const course: Course = {
    id: uuidv4(),
    name: params.name,
    courseCode: params.courseCode,
    term: params.term,
    description: params.description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(`${COURSE_PREFIX}${course.id}`, course);
  await kv.sadd(ALL_COURSES_KEY, course.id);

  return course;
}

export async function getCourse(courseId: string): Promise<Course | null> {
  return kv.get<Course>(`${COURSE_PREFIX}${courseId}`);
}

export async function updateCourse(courseId: string, updates: Partial<Course>): Promise<Course | null> {
  const course = await getCourse(courseId);
  if (!course) return null;

  const updated: Course = {
    ...course,
    ...updates,
    updatedAt: Date.now(),
  };

  await kv.set(`${COURSE_PREFIX}${courseId}`, updated);
  return updated;
}

export async function getAllCourses(): Promise<Course[]> {
  const courseIds = await kv.smembers(ALL_COURSES_KEY);
  if (!courseIds || courseIds.length === 0) return [];

  const courses: Course[] = [];
  for (const id of courseIds) {
    const course = await getCourse(id as string);
    if (course) courses.push(course);
  }

  return courses.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCourse(courseId: string): Promise<void> {
  // Delete all assignments
  const assignmentIds = await kv.smembers(`${COURSE_ASSIGNMENTS_PREFIX}${courseId}`);
  for (const id of assignmentIds || []) {
    await deleteAssignment(id as string);
  }

  // Delete all course-level documents
  const docIds = await kv.smembers(`${COURSE_DOCUMENTS_PREFIX}${courseId}`);
  for (const id of docIds || []) {
    await kv.del(`${DOCUMENT_PREFIX}${id}`);
  }

  await kv.del(`${COURSE_DOCUMENTS_PREFIX}${courseId}`);
  await kv.del(`${COURSE_ASSIGNMENTS_PREFIX}${courseId}`);
  await kv.srem(ALL_COURSES_KEY, courseId);
  await kv.del(`${COURSE_PREFIX}${courseId}`);
}

// ============================================
// Assignment Operations
// ============================================

export async function createAssignment(params: {
  courseId: string;
  name: string;
  instructions: string;
  dueDate?: string;
  subjectArea?: string; // e.g., "Microeconomics", "Public Speaking"
  academicLevel?: string; // e.g., "Undergraduate", "Graduate"
}): Promise<Assignment> {
  const assignment: Assignment = {
    id: uuidv4(),
    courseId: params.courseId,
    name: params.name,
    instructions: params.instructions,
    dueDate: params.dueDate,
    subjectArea: params.subjectArea,
    academicLevel: params.academicLevel,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(`${ASSIGNMENT_PREFIX}${assignment.id}`, assignment);
  await kv.sadd(`${COURSE_ASSIGNMENTS_PREFIX}${params.courseId}`, assignment.id);

  return assignment;
}

export async function getAssignment(assignmentId: string): Promise<Assignment | null> {
  return kv.get<Assignment>(`${ASSIGNMENT_PREFIX}${assignmentId}`);
}

export async function updateAssignment(assignmentId: string, updates: Partial<Assignment>): Promise<Assignment | null> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) return null;

  const updated: Assignment = {
    ...assignment,
    ...updates,
    updatedAt: Date.now(),
  };

  await kv.set(`${ASSIGNMENT_PREFIX}${assignmentId}`, updated);
  return updated;
}

export async function getCourseAssignments(courseId: string): Promise<Assignment[]> {
  const ids = await kv.smembers(`${COURSE_ASSIGNMENTS_PREFIX}${courseId}`);
  if (!ids || ids.length === 0) return [];

  const assignments: Assignment[] = [];
  for (const id of ids) {
    const assignment = await getAssignment(id as string);
    if (assignment) assignments.push(assignment);
  }

  return assignments.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) return;

  // Delete assignment documents
  const docIds = await kv.smembers(`${ASSIGNMENT_DOCUMENTS_PREFIX}${assignmentId}`);
  for (const id of docIds || []) {
    await kv.del(`${DOCUMENT_PREFIX}${id}`);
  }

  await kv.del(`${ASSIGNMENT_DOCUMENTS_PREFIX}${assignmentId}`);
  await kv.srem(`${COURSE_ASSIGNMENTS_PREFIX}${assignment.courseId}`, assignmentId);
  await kv.del(`${ASSIGNMENT_PREFIX}${assignmentId}`);
}

// ============================================
// Rubric Operations
// ============================================

export async function createRubric(params: {
  courseId: string;
  assignmentId?: string;
  name: string;
  criteria: RubricCriterion[];
  rawText?: string;
  sourceType?: 'text' | 'pdf';
  overallConfidence?: 'high' | 'medium' | 'low';
  totalPoints?: number;
  gradingScale?: GradingScale;
}): Promise<Rubric> {
  const rubric: Rubric = {
    id: uuidv4(),
    courseId: params.courseId,
    assignmentId: params.assignmentId,
    name: params.name,
    criteria: params.criteria,
    rawText: params.rawText,
    sourceType: params.sourceType,
    overallConfidence: params.overallConfidence,
    totalPoints: params.totalPoints,
    gradingScale: params.gradingScale,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(`${RUBRIC_PREFIX}${rubric.id}`, rubric);

  // Link to assignment if provided
  if (params.assignmentId) {
    await updateAssignment(params.assignmentId, { rubricId: rubric.id });
  }

  return rubric;
}

export async function getRubric(rubricId: string): Promise<Rubric | null> {
  return kv.get<Rubric>(`${RUBRIC_PREFIX}${rubricId}`);
}

export async function updateRubric(rubricId: string, updates: Partial<Rubric>): Promise<Rubric | null> {
  const rubric = await getRubric(rubricId);
  if (!rubric) return null;

  const updated: Rubric = {
    ...rubric,
    ...updates,
    version: rubric.version + 1,
    updatedAt: Date.now(),
  };

  await kv.set(`${RUBRIC_PREFIX}${rubricId}`, updated);
  return updated;
}

// ============================================
// Document Operations
// ============================================

export async function createDocument(params: {
  courseId: string;
  assignmentId?: string;
  name: string;
  type: Document['type'];
  rawText: string;
  fileKey?: string;
}): Promise<Document> {
  const doc: Document = {
    id: uuidv4(),
    courseId: params.courseId,
    assignmentId: params.assignmentId,
    name: params.name,
    type: params.type,
    rawText: params.rawText,
    fileKey: params.fileKey,
    createdAt: Date.now(),
  };

  await kv.set(`${DOCUMENT_PREFIX}${doc.id}`, doc);

  if (params.assignmentId) {
    await kv.sadd(`${ASSIGNMENT_DOCUMENTS_PREFIX}${params.assignmentId}`, doc.id);
  } else {
    await kv.sadd(`${COURSE_DOCUMENTS_PREFIX}${params.courseId}`, doc.id);
  }

  return doc;
}

export async function getDocument(docId: string): Promise<Document | null> {
  return kv.get<Document>(`${DOCUMENT_PREFIX}${docId}`);
}

export async function getCourseDocuments(courseId: string): Promise<Document[]> {
  const ids = await kv.smembers(`${COURSE_DOCUMENTS_PREFIX}${courseId}`);
  if (!ids || ids.length === 0) return [];

  const docs: Document[] = [];
  for (const id of ids) {
    const doc = await getDocument(id as string);
    if (doc) docs.push(doc);
  }

  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAssignmentDocuments(assignmentId: string): Promise<Document[]> {
  const ids = await kv.smembers(`${ASSIGNMENT_DOCUMENTS_PREFIX}${assignmentId}`);
  if (!ids || ids.length === 0) return [];

  const docs: Document[] = [];
  for (const id of ids) {
    const doc = await getDocument(id as string);
    if (doc) docs.push(doc);
  }

  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId);
  if (!doc) return;

  if (doc.assignmentId) {
    await kv.srem(`${ASSIGNMENT_DOCUMENTS_PREFIX}${doc.assignmentId}`, docId);
  } else {
    await kv.srem(`${COURSE_DOCUMENTS_PREFIX}${doc.courseId}`, docId);
  }

  await kv.del(`${DOCUMENT_PREFIX}${docId}`);
}

// Check if a document with the same name already exists in the course
export async function checkDocumentDuplicate(
  courseId: string, 
  filename: string,
  assignmentId?: string
): Promise<{ exists: boolean; existingDoc?: Document }> {
  const docs = assignmentId 
    ? await getAssignmentDocuments(assignmentId)
    : await getCourseDocuments(courseId);
  
  const normalizedFilename = filename.toLowerCase().trim();
  const existingDoc = docs.find(doc => doc.name.toLowerCase().trim() === normalizedFilename);
  
  return { 
    exists: !!existingDoc, 
    existingDoc 
  };
}

// ============================================
// Bundle Operations
// ============================================

export async function createBundle(params: {
  courseId: string;
  assignmentId: string;
  name: string;
  description?: string;
  rubricId: string;
  documentIds: string[];
  evaluationGuidance?: string;
}): Promise<Bundle> {
  const bundle: Bundle = {
    id: uuidv4(),
    courseId: params.courseId,
    assignmentId: params.assignmentId,
    name: params.name,
    description: params.description,
    rubricId: params.rubricId,
    documentIds: params.documentIds,
    evaluationGuidance: params.evaluationGuidance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(`${BUNDLE_PREFIX}${bundle.id}`, bundle);
  return bundle;
}

export async function getBundle(bundleId: string): Promise<Bundle | null> {
  return kv.get<Bundle>(`${BUNDLE_PREFIX}${bundleId}`);
}

export async function updateBundle(bundleId: string, updates: Partial<Bundle>): Promise<Bundle | null> {
  const bundle = await getBundle(bundleId);
  if (!bundle) return null;

  const updated: Bundle = {
    ...bundle,
    ...updates,
    updatedAt: Date.now(),
  };

  await kv.set(`${BUNDLE_PREFIX}${bundleId}`, updated);
  return updated;
}

// ============================================
// Bundle Version Operations (Immutable Snapshots)
// ============================================

export async function createBundleVersion(bundleId: string): Promise<BundleVersion | null> {
  const bundle = await getBundle(bundleId);
  if (!bundle) return null;

  // Get all referenced content
  const rubric = await getRubric(bundle.rubricId);
  if (!rubric) return null;

  const assignment = await getAssignment(bundle.assignmentId);
  if (!assignment) return null;

  const documents: Document[] = [];
  for (const docId of bundle.documentIds) {
    const doc = await getDocument(docId);
    if (doc) documents.push(doc);
  }

  // Get current version count
  const existingVersionIds = await kv.smembers(`${BUNDLE_VERSIONS_PREFIX}${bundleId}`);
  const versionNumber = (existingVersionIds?.length || 0) + 1;

  const bundleVersion: BundleVersion = {
    id: uuidv4(),
    bundleId: bundleId,
    version: versionNumber,
    snapshot: {
      rubric: { ...rubric },
      assignment: { ...assignment },
      documents: documents.map(d => ({ ...d })),
      evaluationGuidance: bundle.evaluationGuidance,
    },
    createdAt: Date.now(),
  };

  await kv.set(`${BUNDLE_VERSION_PREFIX}${bundleVersion.id}`, bundleVersion);
  await kv.sadd(`${BUNDLE_VERSIONS_PREFIX}${bundleId}`, bundleVersion.id);

  return bundleVersion;
}

export async function getBundleVersion(versionId: string): Promise<BundleVersion | null> {
  return kv.get<BundleVersion>(`${BUNDLE_VERSION_PREFIX}${versionId}`);
}

export async function getBundleVersions(bundleId: string): Promise<BundleVersion[]> {
  const ids = await kv.smembers(`${BUNDLE_VERSIONS_PREFIX}${bundleId}`);
  if (!ids || ids.length === 0) return [];

  const versions: BundleVersion[] = [];
  for (const id of ids) {
    const version = await getBundleVersion(id as string);
    if (version) versions.push(version);
  }

  return versions.sort((a, b) => b.version - a.version);
}

export async function getLatestBundleVersion(bundleId: string): Promise<BundleVersion | null> {
  const versions = await getBundleVersions(bundleId);
  return versions.length > 0 ? versions[0] : null;
}

// ============================================
// Helper: Get or Create Bundle for Assignment
// ============================================

export async function getOrCreateAssignmentBundle(assignmentId: string): Promise<Bundle | null> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) return null;

  // Check if bundle already exists for this assignment
  // For now, we'll create a simple naming convention
  const bundleKey = `assignment_bundle:${assignmentId}`;
  const existingBundleId = await kv.get<string>(bundleKey);
  
  if (existingBundleId) {
    return getBundle(existingBundleId);
  }

  // Create new bundle
  const rubricId = assignment.rubricId;
  if (!rubricId) return null;

  const courseDocs = await getCourseDocuments(assignment.courseId);
  const assignmentDocs = await getAssignmentDocuments(assignmentId);
  const allDocIds = [...courseDocs, ...assignmentDocs].map(d => d.id);

  const bundle = await createBundle({
    courseId: assignment.courseId,
    assignmentId: assignmentId,
    name: `${assignment.name} Context`,
    rubricId: rubricId,
    documentIds: allDocIds,
  });

  await kv.set(bundleKey, bundle.id);
  return bundle;
}

// ============================================
// Helper: Get Context for Grading
// ============================================

export interface GradingContext {
  bundleVersionId: string;
  bundleVersion: number;
  rubric: Rubric;
  assignment: Assignment;
  documents: Document[];
  evaluationGuidance?: string;
  // Course info for fallback
  course?: Course;
  courseSummary?: string;
  // Formatted for AI prompt
  rubricJSON: string;
  assignmentSummary: string;
  documentContext: string;
}

export async function getGradingContext(bundleVersionId: string): Promise<GradingContext | null> {
  const version = await getBundleVersion(bundleVersionId);
  if (!version) return null;

  const { rubric, assignment, documents, evaluationGuidance } = version.snapshot;

  // Get course for summary fallback
  const course = await getCourse(assignment.courseId);

  // Format rubric for AI
  const rubricJSON = JSON.stringify({
    name: rubric.name,
    criteria: rubric.criteria.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      weight: c.weight,
      requiredEvidence: c.requiredEvidenceTypes,
    })),
  }, null, 2);

  // Format assignment summary
  const assignmentSummary = `Assignment: ${assignment.name}\n\nInstructions:\n${assignment.instructions}`;

  // Format document context
  const documentContext = documents.length > 0
    ? documents.map(d => `[${d.type.toUpperCase()}] ${d.name}:\n${d.rawText.slice(0, 2000)}`).join('\n\n---\n\n')
    : '';

  // Build course summary for fallback (from course.summary or auto-generate from course info)
  let courseSummary = course?.summary;
  if (!courseSummary && course) {
    // Auto-generate a basic summary from course metadata + key themes
    const themes = course.keyThemes?.join(', ') || '';
    courseSummary = `Course: ${course.name} (${course.courseCode}) - ${course.term}\n` +
      (course.description ? `\n${course.description}\n` : '') +
      (themes ? `\nKey themes: ${themes}` : '');
  }

  return {
    bundleVersionId: version.id,
    bundleVersion: version.version,
    rubric,
    assignment,
    documents,
    evaluationGuidance,
    course: course || undefined,
    courseSummary,
    rubricJSON,
    assignmentSummary,
    documentContext,
  };
}

