export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes for processing (Vercel Pro)

import { NextRequest, NextResponse } from 'next/server';
import {
  getQueueLength,
  getNextQueuedSubmission,
  getSubmission,
  updateSubmission,
  updateBatchStats,
  getBatch,
  getBatchSubmissions,
  requeue
} from '@/lib/batch-store';
import { getPresignedDownloadUrl, isR2Configured } from '@/lib/r2';
import { analyzeWithClaude, isClaudeConfigured, generateQuestionsWithClaude, evaluateWithClaude, ProfessorContext, GradingScaleConfig } from '@/lib/claude';
import { verifyWithClaude } from '@/lib/verify';
import { createClient } from '@deepgram/sdk';
import { config } from '@/lib/config';
import { getGradingContext, type GradingContext } from '@/lib/context-store';
import {
  retrieveContextForGrading,
  retrieveContextByCriterion,
  isEmbeddingsConfigured,
  type RetrievalResult,
  type CriterionRetrievalResult,
} from '@/lib/embeddings';

// Process 1 submission per request - frontend fires multiple parallel requests
// This gives each video its own 300s timeout
const MAX_PER_REQUEST = 1;

// Lazy Deepgram client
let deepgramClient: ReturnType<typeof createClient> | null = null;

function getDeepgram() {
  if (!deepgramClient) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');
    deepgramClient = createClient(apiKey);
  }
  return deepgramClient;
}

async function transcribeFromUrl(url: string): Promise<{
  transcript: string;
  segments: Array<{ id: string; text: string; timestamp: number; speaker?: string }>;
}> {
  const deepgram = getDeepgram();

  const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    { url },
    { model: 'nova-2', language: 'en', smart_format: true, punctuate: true, diarize: true, paragraphs: true }
  );

  if (error) throw new Error(`Deepgram error: ${error.message}`);

  const channel = result?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  if (!alternative) return { transcript: '', segments: [] };

  const transcript = alternative.transcript || '';
  const segments: Array<{ id: string; text: string; timestamp: number; speaker?: string }> = [];

  if (alternative.paragraphs?.paragraphs) {
    alternative.paragraphs.paragraphs.forEach((para, i) => {
      (para.sentences || []).forEach((sent, j) => {
        segments.push({
          id: `seg-${i}-${j}`,
          text: sent.text || '',
          timestamp: Math.round((sent.start || 0) * 1000),
          speaker: para.speaker !== undefined ? `Speaker ${para.speaker + 1}` : undefined,
        });
      });
    });
  }

  return { transcript, segments };
}

async function processSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  const submission = await getSubmission(submissionId);

  if (!submission) {
    console.error(`[ProcessNow] Submission ${submissionId} not found`);
    return { success: false, error: 'Submission not found' };
  }

  console.log(`[ProcessNow] START submissionId=${submissionId} file=${submission.originalFilename}`);

  try {
    await updateSubmission(submissionId, { status: 'transcribing', startedAt: Date.now() });

    // Transcribe
    const downloadUrl = await getPresignedDownloadUrl(submission.fileKey);
    console.log(`[ProcessNow] Transcribing ${submissionId}...`);
    const { transcript, segments } = await transcribeFromUrl(downloadUrl);

    if (!transcript || transcript.trim().length < 10) {
      throw new Error('Transcription returned empty or too short');
    }

    await updateSubmission(submissionId, { transcript, transcriptSegments: segments, status: 'analyzing' });

    // Analyze with Babblet AI
    if (isClaudeConfigured()) {
      console.log(`[ProcessNow] Analyzing ${submissionId}...`);

      const batch = await getBatch(submission.batchId);

      // Get grading context if available
      let gradingContext: GradingContext | null = null;
      const bundleVersionId = submission.bundleVersionId || batch?.bundleVersionId;

      if (bundleVersionId) {
        gradingContext = await getGradingContext(bundleVersionId);
        if (gradingContext) {
          console.log(`[ProcessNow] Using context v${gradingContext.bundleVersion} for ${submissionId}`);
        }
      }

      const analysis = await analyzeWithClaude(transcript);

      // Build rubric criteria from context or batch
      let rubricCriteria = batch?.rubricCriteria;
      if (gradingContext) {
        // Use structured rubric from context
        rubricCriteria = gradingContext.rubricJSON;
      }

      // Build assignment context for better evaluation
      let assignmentContext = '';
      let retrievedContext: RetrievalResult | null = null;

      // Criterion-level retrieval for better context mapping
      let criterionRetrievalResult: CriterionRetrievalResult | null = null;

      // Retrieval quality metrics for logging
      let retrievalMetrics = {
        chunksRetrieved: 0,
        averageRelevance: 0,
        highConfidenceCount: 0,
        usedFallback: false,
        contextCharsUsed: 0,
      };

      if (gradingContext) {
        assignmentContext = `${gradingContext.assignmentSummary}\n\n${gradingContext.evaluationGuidance || ''}`;

        // Get course summary for fallback
        const courseSummary = gradingContext.courseSummary;

        // Retrieve relevant document chunks using embeddings
        if (isEmbeddingsConfigured() && batch?.courseId) {
          try {
            // Use criterion-level retrieval if we have rubric criteria
            if (gradingContext.rubric?.criteria?.length > 0) {
              criterionRetrievalResult = await retrieveContextByCriterion(
                transcript,
                gradingContext.rubric.criteria.map(c => ({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                })),
                batch.courseId,
                batch.assignmentId,
                undefined, // Use default chunks per criterion
                courseSummary // Pass course summary for fallback
              );

              // Track retrieval metrics
              retrievalMetrics = {
                chunksRetrieved: criterionRetrievalResult.totalChunksRetrieved,
                averageRelevance: criterionRetrievalResult.averageRelevance,
                highConfidenceCount: criterionRetrievalResult.highConfidenceCount,
                usedFallback: criterionRetrievalResult.averageRelevance < 0.25 && !!courseSummary,
                contextCharsUsed: criterionRetrievalResult.contextCharsUsed,
              };

              // Use formatted context from enhanced retrieval
              retrievedContext = {
                chunks: [],
                formattedContext: criterionRetrievalResult.formattedContext,
                citations: criterionRetrievalResult.allCitations,
                averageRelevance: criterionRetrievalResult.averageRelevance,
                highConfidenceCount: criterionRetrievalResult.highConfidenceCount,
                usedFallback: retrievalMetrics.usedFallback,
              };

              console.log(`[ProcessNow] Context retrieval: ${retrievalMetrics.chunksRetrieved} chunks, ` +
                `avg relevance=${retrievalMetrics.averageRelevance.toFixed(2)}, ` +
                `high-confidence=${retrievalMetrics.highConfidenceCount}, ` +
                `chars=${retrievalMetrics.contextCharsUsed}, ` +
                `fallback=${retrievalMetrics.usedFallback}`);
            } else {
              // Fallback to general retrieval with course summary
              retrievedContext = await retrieveContextForGrading(
                transcript,
                batch.courseId,
                batch.assignmentId,
                5,
                courseSummary // Pass course summary for fallback
              );

              retrievalMetrics = {
                chunksRetrieved: retrievedContext.chunks.length,
                averageRelevance: retrievedContext.averageRelevance,
                highConfidenceCount: retrievedContext.highConfidenceCount,
                usedFallback: retrievedContext.usedFallback,
                contextCharsUsed: retrievedContext.formattedContext.length,
              };
            }

            if (retrievedContext?.formattedContext) {
              assignmentContext += `\n\n--- RELEVANT COURSE MATERIALS ---\n${retrievedContext.formattedContext}`;
            }
          } catch (retrievalError) {
            console.error('[ProcessNow] Document retrieval failed:', retrievalError);
            // If retrieval fails but we have course summary, use it as fallback
            if (courseSummary) {
              assignmentContext += `\n\n--- COURSE OVERVIEW ---\n${courseSummary}`;
              retrievalMetrics.usedFallback = true;
              console.log('[ProcessNow] Using course summary fallback due to retrieval error');
            }
          }
        }
      }

      // Parallel: rubric, questions, verify
      const claims = analysis.keyClaims.slice(0, config.limits.maxClaimsForVerification).map(c => c.claim);

      // Combine rubric criteria with assignment context for evaluation
      const fullRubricContext = assignmentContext
        ? `${rubricCriteria || ''}\n\n--- ASSIGNMENT CONTEXT ---\n${assignmentContext}`
        : rubricCriteria;

      // Build professor context for subject-matter evaluation
      const professorContext: ProfessorContext | undefined = gradingContext?.course ? {
        courseName: gradingContext.course.name,
        courseCode: gradingContext.course.courseCode,
        term: gradingContext.course.term,
        subjectArea: gradingContext.assignment.subjectArea,
        academicLevel: gradingContext.assignment.academicLevel,
        assignmentName: gradingContext.assignment.name,
        assignmentInstructions: gradingContext.assignment.instructions,
        classMaterials: gradingContext.documentContext,
        evaluationGuidance: gradingContext.evaluationGuidance,
      } : undefined;

      // Build grading scale config from rubric
      const gradingScaleConfig: GradingScaleConfig | undefined = gradingContext?.rubric?.gradingScale ? {
        type: gradingContext.rubric.gradingScale.type,
        maxScore: gradingContext.rubric.gradingScale.maxScore,
        letterGrades: gradingContext.rubric.gradingScale.letterGrades,
        bands: gradingContext.rubric.gradingScale.bands,
      } : undefined;

      const [rubricResult, questionsResult, verifyResult] = await Promise.allSettled([
        evaluateWithClaude(transcript, fullRubricContext, undefined, analysis, segments, professorContext, gradingScaleConfig),
        generateQuestionsWithClaude(transcript, analysis, undefined, { maxQuestions: config.limits.defaultMaxQuestions }),
        claims.length > 0 ? verifyWithClaude(transcript, claims) : Promise.resolve([]),
      ]);

      const rubricEvaluation = rubricResult.status === 'fulfilled' ? rubricResult.value : null;
      const questions = questionsResult.status === 'fulfilled' ? questionsResult.value : [];
      const findings = verifyResult.status === 'fulfilled' ? verifyResult.value : [];

      // Log if rubric evaluation failed
      if (rubricResult.status === 'rejected') {
        console.error(`[ProcessNow] Rubric evaluation FAILED for ${submissionId}:`, rubricResult.reason);
      }
      if (questionsResult.status === 'rejected') {
        console.error(`[ProcessNow] Questions generation FAILED for ${submissionId}:`, questionsResult.reason);
      }

      await updateSubmission(submissionId, {
        // Store the bundleVersionId used for grading
        bundleVersionId: bundleVersionId,
        // Store citations from retrieved documents
        contextCitations: retrievedContext?.citations || undefined,
        // Store retrieval quality metrics for transparency
        retrievalMetrics: retrievalMetrics.chunksRetrieved > 0 || retrievalMetrics.usedFallback
          ? retrievalMetrics
          : undefined,
        analysis: {
          keyClaims: analysis.keyClaims.map(c => ({ id: c.id, claim: c.claim, evidence: c.evidence })),
          logicalGaps: analysis.logicalGaps.map(g => ({ id: g.id, description: g.description, severity: g.severity })),
          missingEvidence: analysis.missingEvidence.map(e => ({ id: e.id, description: e.description })),
          overallStrength: analysis.overallStrength,
        },
        rubricEvaluation: rubricEvaluation ? {
          overallScore: rubricEvaluation.overallScore,
          // Grading scale metadata
          gradingScaleUsed: rubricEvaluation.gradingScaleUsed,
          maxPossibleScore: rubricEvaluation.maxPossibleScore,
          letterGrade: rubricEvaluation.letterGrade,
          bandLabel: rubricEvaluation.bandLabel,
          criteriaBreakdown: rubricEvaluation.criteriaBreakdown?.map(c => {
            // Find criterion-level citations for this criterion
            const criterionCites = criterionRetrievalResult?.criterionCitations.find(
              cc => cc.criterionName.toLowerCase() === c.criterion.toLowerCase() ||
                cc.criterionName.includes(c.criterion) ||
                c.criterion.includes(cc.criterionName)
            );
            // Include all enhanced data (criterionId, transcriptRefs, maxScore, etc.)
            return {
              criterionId: c.criterionId,
              criterion: c.criterion,
              score: c.score,
              maxScore: c.maxScore, // Criterion-level max from rubric
              feedback: c.feedback,
              transcriptRefs: c.transcriptRefs,
              citations: criterionCites?.citations || undefined,
            };
          }),
          // Collect strengths and improvements with their deep-linking data
          strengths: rubricEvaluation.criteriaBreakdown?.flatMap(c =>
            ((c as any).strengths || []).map((s: any) =>
              typeof s === 'string' ? s : {
                text: s.text,
                criterionId: s.criterionId || (c as any).criterionId,
                criterionName: s.criterionName || c.criterion,
                transcriptRefs: s.transcriptRefs,
              }
            )
          ) || [],
          improvements: rubricEvaluation.criteriaBreakdown?.flatMap(c =>
            ((c as any).improvements || []).map((s: any) =>
              typeof s === 'string' ? s : {
                text: s.text,
                criterionId: s.criterionId || (c as any).criterionId,
                criterionName: s.criterionName || c.criterion,
                transcriptRefs: s.transcriptRefs,
              }
            )
          ) || [],
        } : undefined,
        questions: questions.slice(0, 8).map(q => ({ id: q.id, question: q.question, category: q.category })),
        verificationFindings: findings.map(f => ({ id: f.id, statement: f.statement, status: f.verdict, explanation: f.explanation })),
        status: 'ready',
        completedAt: Date.now(),
      });
    } else {
      await updateSubmission(submissionId, { status: 'ready', completedAt: Date.now() });
    }

    console.log(`[ProcessNow] COMPLETE submissionId=${submissionId} duration=${Date.now() - startTime}ms`);
    await updateBatchStats(submission.batchId);
    return { success: true };

  } catch (error) {
    console.error(`[ProcessNow] FAILED submissionId=${submissionId} error=${error instanceof Error ? error.message : 'Unknown'}`);
    await updateSubmission(submissionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: Date.now(),
    });
    await updateBatchStats(submission.batchId);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// POST /api/bulk/process-now - Process submissions directly (no auth needed)
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check for batchId param to re-queue stuck submissions
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    let queueLength = await getQueueLength();
    console.log(`[ProcessNow] Initial queue length: ${queueLength}`);

    // If queue is empty but batchId provided, re-queue stuck submissions
    if (queueLength === 0 && batchId) {
      console.log(`[ProcessNow] Queue empty, checking for stuck submissions in batch ${batchId}`);
      const submissions = await getBatchSubmissions(batchId);
      const stuckSubmissions = submissions.filter(s => s.status === 'queued');

      console.log(`[ProcessNow] Found ${stuckSubmissions.length} stuck submissions`);

      for (const sub of stuckSubmissions) {
        await requeue(sub.id);
        console.log(`[ProcessNow] Re-queued submission ${sub.id}`);
      }

      queueLength = await getQueueLength();
      console.log(`[ProcessNow] Queue length after re-queue: ${queueLength}`);
    }

    if (queueLength === 0) {
      return NextResponse.json({
        success: true,
        message: 'Queue is empty, nothing to process',
        processed: 0
      });
    }

    // Check dependencies
    if (!isR2Configured()) {
      return NextResponse.json({
        success: false,
        error: 'R2 storage not configured'
      }, { status: 500 });
    }

    if (!process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'DEEPGRAM_API_KEY not configured'
      }, { status: 500 });
    }

    // Get next queued submission
    const submissionId = await getNextQueuedSubmission();
    
    if (!submissionId) {
      return NextResponse.json({
        success: true,
        message: 'No submissions available to process',
        processed: 0
      });
    }

    console.log(`[ProcessNow] Processing submission: ${submissionId}`);

    // Process single submission (frontend fires multiple parallel requests)
    const result = await processSubmission(submissionId);

    const processed: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    if (result.success) {
      processed.push(submissionId);
    } else {
      errors.push({ id: submissionId, error: result.error || 'Unknown error' });
    }

    const duration = Date.now() - startTime;
    console.log(`[ProcessNow] Completed. Processed: ${processed.length}, Errors: ${errors.length}, Duration: ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: `Processed ${processed.length} submissions`,
      processed: processed.length,
      processedIds: processed,
      errors,
      duration,
      remainingInQueue: await getQueueLength(),
    });
  } catch (error) {
    console.error('[ProcessNow] Fatal error:', error);
    return NextResponse.json(
      { error: 'Processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/bulk/process-now - Check configuration
export async function GET() {
  try {
    const queueLength = await getQueueLength();

    return NextResponse.json({
      success: true,
      queueLength,
      maxPerRequest: MAX_PER_REQUEST,
      r2Configured: isR2Configured(),
      deepgramConfigured: !!process.env.DEEPGRAM_API_KEY,
      claudeConfigured: isClaudeConfigured(),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
