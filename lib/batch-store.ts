// ============================================
// Batch Store for Bulk Upload Processing
// Uses Vercel KV (Upstash Redis) for durability
// ============================================

import { kv } from '@vercel/kv';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export type SubmissionStatus = 
  | 'queued' 
  | 'uploading' 
  | 'transcribing' 
  | 'analyzing' 
  | 'ready' 
  | 'failed';

export interface Submission {
  id: string;
  batchId: string;
  // File info
  originalFilename: string;
  fileKey: string; // R2 key
  fileSize: number;
  mimeType: string;
  // Student mapping
  studentName: string;
  studentId?: string; // optional external ID
  // Context (versioned grading context)
  bundleVersionId?: string; // The snapshot used for grading this submission
  contextCitations?: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  // Retrieval quality metrics (for transparency)
  retrievalMetrics?: {
    chunksRetrieved: number;
    averageRelevance: number;
    highConfidenceCount: number;
    usedFallback: boolean;
    contextCharsUsed: number;
  };
  // Processing status
  status: SubmissionStatus;
  errorMessage?: string;
  // Results (populated after processing)
  transcript?: string;
  transcriptSegments?: Array<{
    id: string;
    text: string;
    timestamp: number;
    speaker?: string;
  }>;
  analysis?: {
    keyClaims: Array<{ id: string; claim: string; evidence: string[] }>;
    logicalGaps: Array<{ id: string; description: string; severity: string }>;
    missingEvidence: Array<{ id: string; description: string }>;
    overallStrength: number;
  };
  rubricEvaluation?: {
    overallScore: number;
    // Grading scale metadata (from rubric)
    gradingScaleUsed?: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
    maxPossibleScore?: number;
    letterGrade?: string; // e.g., "A", "B+"
    bandLabel?: string; // e.g., "Excellent", "Good"
    criteriaBreakdown?: Array<{
      criterionId?: string; // Links to rubric criterion ID
      criterion: string;
      score: number;
      maxScore?: number; // Maximum for this criterion (from rubric)
      feedback: string;
      // Babblet rationale tying rubric, context, and accuracy checks
      rationale?: string;
      // Transcript segment references for this criterion
      transcriptRefs?: Array<{
        segmentId: string;
        timestamp: number;
        snippet: string;
      }>;
      // Document citations (Stage 4)
      citations?: Array<{
        chunkId: string;
        documentName: string;
        snippet: string;
        relevanceScore?: number;
      }>;
    }>;
    // Strengths with deep linking
    strengths: Array<string | {
      text: string;
      criterionId?: string;
      criterionName?: string;
      transcriptRefs?: Array<{
        segmentId: string;
        timestamp: number;
        snippet: string;
      }>;
    }>;
    // Improvements with deep linking
    improvements: Array<string | {
      text: string;
      criterionId?: string;
      criterionName?: string;
      transcriptRefs?: Array<{
        segmentId: string;
        timestamp: number;
        snippet: string;
      }>;
    }>;
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  verificationFindings?: Array<{
    id: string;
    statement: string;
    status: string;
    explanation: string;
  }>;
  // Instructor annotations
  annotations?: {
    flaggedSegments: Array<{
      id: string;
      segmentIndex: number;
      timestamp: string;
      reason?: string;
      createdAt: number;
    }>;
    comments: Array<{
      id: string;
      segmentIndex: number;
      timestamp: string;
      text: string;
      createdAt: number;
    }>;
    isGraded?: boolean;
    gradedAt?: number;
  };
  // Extracted slide content from video (screen share)
  slideContent?: {
    slides: Array<{
      slideNumber: number;
      timestamp: number;
      title?: string;
      textContent: string;
      keyPoints: string[];
      visualElements?: string[];
      dataOrCharts?: string[];
    }>;
    presentationType: 'screen_share' | 'webcam_only' | 'mixed';
    summary: string;
  };
  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Batch {
  id: string;
  // Metadata
  name: string;
  courseName?: string;
  assignmentName?: string;
  // Context (new versioned system)
  courseId?: string;
  assignmentId?: string;
  bundleVersionId?: string; // Immutable snapshot used for grading
  // Settings (legacy - for batches without context)
  rubricCriteria?: string;
  rubricTemplateId?: string;
  // ============================================
  // SUBMISSION IDS: Stored directly in batch for atomic reads
  // This avoids eventual consistency issues with separate Redis sets
  // ============================================
  submissionIds?: string[];
  // ============================================
  // UPLOAD TRACKING: Persistent expected upload count
  // Set when batch is created, cleared when all files are uploaded
  // This ensures consistent progress tracking across page refreshes
  // ============================================
  expectedUploadCount?: number;
  // Stats
  totalSubmissions: number;
  processedCount: number;
  failedCount: number;
  // Status
  status: 'active' | 'processing' | 'completed' | 'archived';
  // Timing
  createdAt: number;
  updatedAt: number;
}

// ============================================
// KV Keys
// ============================================

const BATCH_PREFIX = 'batch:';
const SUBMISSION_PREFIX = 'submission:';
const BATCH_SUBMISSIONS_PREFIX = 'batch_submissions:';
const QUEUE_KEY = 'submission_queue';
const ALL_BATCHES_KEY = 'all_batches';

// ============================================
// Batch Operations
// ============================================

export async function createBatch(params: {
  name: string;
  courseName?: string;
  assignmentName?: string;
  rubricCriteria?: string;
  rubricTemplateId?: string;
  // Context references (new versioned system)
  courseId?: string;
  assignmentId?: string;
  bundleVersionId?: string;
  // Upload tracking
  expectedUploadCount?: number;
}): Promise<Batch> {
  const batch: Batch = {
    id: uuidv4(),
    name: params.name,
    courseName: params.courseName,
    assignmentName: params.assignmentName,
    // Context references
    courseId: params.courseId,
    assignmentId: params.assignmentId,
    bundleVersionId: params.bundleVersionId,
    // Legacy settings
    rubricCriteria: params.rubricCriteria,
    rubricTemplateId: params.rubricTemplateId,
    // Upload tracking - stored for persistent progress across refreshes
    expectedUploadCount: params.expectedUploadCount,
    totalSubmissions: 0,
    processedCount: 0,
    failedCount: 0,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(`${BATCH_PREFIX}${batch.id}`, batch);
  await kv.sadd(ALL_BATCHES_KEY, batch.id);

  return batch;
}

export async function getBatch(batchId: string): Promise<Batch | null> {
  return kv.get<Batch>(`${BATCH_PREFIX}${batchId}`);
}

export async function updateBatch(batchId: string, updates: Partial<Batch>): Promise<Batch | null> {
  const batch = await getBatch(batchId);
  if (!batch) return null;

  const updated: Batch = {
    ...batch,
    ...updates,
    updatedAt: Date.now(),
  };

  await kv.set(`${BATCH_PREFIX}${batchId}`, updated);
  return updated;
}

export async function getAllBatches(): Promise<Batch[]> {
  const batchIds = await kv.smembers(ALL_BATCHES_KEY);
  if (!batchIds || batchIds.length === 0) return [];

  const batches: Batch[] = [];
  for (const id of batchIds) {
    const batch = await getBatch(id as string);
    if (batch) batches.push(batch);
  }

  // Sort by createdAt descending
  return batches.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteBatch(batchId: string): Promise<void> {
  // Get batch to find submission IDs
  const batch = await getBatch(batchId);
  const submissionIds = batch?.submissionIds || [];
  
  // Delete each submission
  for (const subId of submissionIds) {
    await kv.del(`${SUBMISSION_PREFIX}${subId}`);
  }

  // Delete legacy batch submissions set
  await kv.del(`${BATCH_SUBMISSIONS_PREFIX}${batchId}`);

  // Remove from all batches
  await kv.srem(ALL_BATCHES_KEY, batchId);

  // Delete batch
  await kv.del(`${BATCH_PREFIX}${batchId}`);
}

export async function deleteSubmission(submissionId: string): Promise<boolean> {
  // Get submission first to find its batch
  const submission = await getSubmission(submissionId);
  if (!submission) {
    return false;
  }

  // Remove from batch's submissionIds array
  const batch = await getBatch(submission.batchId);
  if (batch && batch.submissionIds) {
    await updateBatch(submission.batchId, {
      submissionIds: batch.submissionIds.filter(id => id !== submissionId),
      totalSubmissions: Math.max(0, (batch.totalSubmissions || 1) - 1),
    });
  }

  // Also remove from legacy set
  await kv.srem(`${BATCH_SUBMISSIONS_PREFIX}${submission.batchId}`, submissionId);

  // Delete the submission
  await kv.del(`${SUBMISSION_PREFIX}${submissionId}`);

  // Update batch stats
  await updateBatchStats(submission.batchId);

  return true;
}

// ============================================
// Submission Operations
// ============================================

export async function createSubmission(params: {
  batchId: string;
  originalFilename: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  studentName?: string;
}): Promise<Submission> {
  // Infer student name from filename if not provided
  const inferredName = params.studentName || inferStudentName(params.originalFilename);

  const submission: Submission = {
    id: uuidv4(),
    batchId: params.batchId,
    originalFilename: params.originalFilename,
    fileKey: params.fileKey,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    studentName: inferredName,
    status: 'queued',
    createdAt: Date.now(),
  };

  // Save submission first (this is idempotent)
  await kv.set(`${SUBMISSION_PREFIX}${submission.id}`, submission);

  // ============================================
  // SUBMISSION IDS: Use atomic Redis SET as source of truth
  // The SET operation (sadd) is atomic and handles concurrent adds correctly
  // We'll rebuild batch.submissionIds from the SET when needed
  // ============================================
  
  // Add to the atomic Redis SET first (this never loses data)
  await kv.sadd(`${BATCH_SUBMISSIONS_PREFIX}${params.batchId}`, submission.id);
  
  // ============================================
  // BATCH UPDATE: Retry loop to handle concurrent updates
  // If another process updated the batch between our read and write,
  // we re-read and retry to ensure our submission ID is included
  // ============================================
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const batch = await getBatch(params.batchId);
    if (!batch) {
      console.error(`[BatchStore] Batch ${params.batchId} not found on attempt ${attempt + 1}`);
      break;
    }
    
    const currentIds = batch.submissionIds || [];
    
    // Already includes our submission - we're done
    if (currentIds.includes(submission.id)) {
      break;
    }
    
    // Get all IDs from the atomic SET to ensure we don't lose any
    const setIds = await kv.smembers(`${BATCH_SUBMISSIONS_PREFIX}${params.batchId}`) as string[];
    
    // Merge: include all IDs from both sources
    const mergedIds = Array.from(new Set([...currentIds, ...setIds, submission.id]));
    
    try {
      await updateBatch(params.batchId, {
        submissionIds: mergedIds,
        totalSubmissions: mergedIds.length,
      });
      console.log(`[BatchStore] Updated batch ${params.batchId} with ${mergedIds.length} submissions (attempt ${attempt + 1})`);
      break;
    } catch (err) {
      console.warn(`[BatchStore] Retry ${attempt + 1}/${MAX_RETRIES} updating batch ${params.batchId}:`, err);
      // Small delay before retry with exponential backoff
      await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
    }
  }

  // Add to processing queue
  await kv.rpush(QUEUE_KEY, submission.id);
  
  console.log(`[BatchStore] Created submission ${submission.id} for batch ${params.batchId}`);

  return submission;
}

export async function getSubmission(submissionId: string): Promise<Submission | null> {
  return kv.get<Submission>(`${SUBMISSION_PREFIX}${submissionId}`);
}

export async function updateSubmission(
  submissionId: string, 
  updates: Partial<Submission>
): Promise<Submission | null> {
  const submission = await getSubmission(submissionId);
  if (!submission) return null;

  const updated: Submission = {
    ...submission,
    ...updates,
  };

  await kv.set(`${SUBMISSION_PREFIX}${submissionId}`, updated);
  return updated;
}

export async function getBatchSubmissions(batchId: string): Promise<Submission[]> {
  // Use batch.submissionIds as source of truth (atomic with batch record)
  const batch = await getBatch(batchId);
  const submissionIds = batch?.submissionIds || [];
  
  if (submissionIds.length === 0) return [];

  const submissions: Submission[] = [];
  for (const id of submissionIds) {
    const sub = await getSubmission(id);
    if (sub) submissions.push(sub);
  }

  // Sort by studentName
  return submissions.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

// ============================================
// Queue Operations
// ============================================

export async function getNextQueuedSubmission(): Promise<string | null> {
  const submissionId = await kv.lpop<string>(QUEUE_KEY);
  return submissionId;
}

export async function getQueueLength(): Promise<number> {
  return kv.llen(QUEUE_KEY);
}

export async function requeue(submissionId: string): Promise<void> {
  await kv.rpush(QUEUE_KEY, submissionId);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Infer student name from filename
 * Common patterns:
 * - "John_Doe_Presentation.mp4" → "John Doe"
 * - "john-doe-video.mov" → "John Doe"
 * - "JohnDoe.mp4" → "JohnDoe"
 * - "12345_Smith_John.mp4" → "Smith John"
 */
function inferStudentName(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  
  // Remove common suffixes
  const cleaned = nameWithoutExt
    .replace(/[-_](presentation|video|recording|submission|final|v\d+)$/i, '')
    .replace(/[-_]\d{4,}$/, ''); // Remove trailing IDs
  
  // Replace separators with spaces
  const spaced = cleaned.replace(/[-_]/g, ' ');
  
  // Title case each word
  const titleCased = spaced
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  
  return titleCased || nameWithoutExt;
}

/**
 * Update batch stats after a submission completes
 * Only updates if we can find submissions - protects against eventual consistency issues
 * 
 * GRADING STATUS: Single source of truth
 * A submission is "graded" ONLY if it has an actual score (overallScore defined)
 * This matches computeGradingStatus in /api/bulk/status/route.ts
 */
export async function updateBatchStats(batchId: string): Promise<void> {
  const batch = await getBatch(batchId);
  const submissions = await getBatchSubmissions(batchId);
  
  // IMPORTANT: If we found 0 submissions but batch thinks it has some,
  // don't overwrite - this is likely an eventual consistency issue
  if (submissions.length === 0 && batch && batch.totalSubmissions > 0) {
    console.log(`[BatchStore] Skipping stats update for ${batchId}: found 0 submissions but batch has ${batch.totalSubmissions}`);
    return;
  }
  
  // Count submissions with ACTUAL grades (score defined), not just status='ready'
  const gradedCount = submissions.filter(s => 
    s.status === 'ready' && 
    s.rubricEvaluation?.overallScore !== undefined && 
    s.rubricEvaluation?.overallScore !== null
  ).length;
  const failedCount = submissions.filter(s => s.status === 'failed').length;
  const readyCount = submissions.filter(s => s.status === 'ready').length;
  
  // Only mark completed when ALL submissions have actual grades
  const allGraded = gradedCount === submissions.length && submissions.length > 0;
  
  // If all ready/failed but not all have grades, we're still processing (finalizing)
  const allFinished = readyCount + failedCount === submissions.length && submissions.length > 0;
  const status = allGraded ? 'completed' : (allFinished || gradedCount > 0) ? 'processing' : 'active';
  
  console.log(`[BatchStore] Updating stats for ${batchId}: graded=${gradedCount}, ready=${readyCount}, failed=${failedCount}, status=${status}`);
  
  await updateBatch(batchId, {
    totalSubmissions: submissions.length,
    processedCount: gradedCount, // Report actual graded count
    failedCount,
    status,
  });
}

