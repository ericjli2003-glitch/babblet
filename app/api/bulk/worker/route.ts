export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  getNextQueuedSubmission, 
  getSubmission, 
  updateSubmission, 
  updateBatchStats,
  getBatch,
  getQueueLength
} from '@/lib/batch-store';
import { getPresignedDownloadUrl } from '@/lib/r2';
import { analyzeWithClaude, isClaudeConfigured, generateQuestionsWithClaude, evaluateWithClaude } from '@/lib/claude';
import { verifyWithClaude } from '@/lib/verify';
import { analyzeVideoForSlides, buildPresentationContext, isGeminiConfigured } from '@/lib/gemini';
import { createClient } from '@deepgram/sdk';
import { config } from '@/lib/config';

// Process up to N submissions per worker invocation
const MAX_SUBMISSIONS_PER_RUN = 3;

// Initialize Deepgram client lazily
let deepgramClient: ReturnType<typeof createClient> | null = null;

function getDeepgram() {
  if (!deepgramClient) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }
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
    {
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      punctuate: true,
      diarize: true,
      paragraphs: true,
    }
  );

  if (error) {
    throw new Error(`Deepgram error: ${error.message}`);
  }

  // Extract transcript and segments
  const channel = result?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  
  if (!alternative) {
    return { transcript: '', segments: [] };
  }

  const transcript = alternative.transcript || '';
  
  // Build segments from words or paragraphs
  const segments: Array<{ id: string; text: string; timestamp: number; speaker?: string }> = [];
  
  if (alternative.paragraphs?.paragraphs) {
    alternative.paragraphs.paragraphs.forEach((para, i) => {
      const sentences = para.sentences || [];
      sentences.forEach((sent, j) => {
        segments.push({
          id: `seg-${i}-${j}`,
          text: sent.text || '',
          timestamp: Math.round((sent.start || 0) * 1000),
          speaker: para.speaker !== undefined ? `Speaker ${para.speaker + 1}` : undefined,
        });
      });
    });
  } else if (alternative.words) {
    // Fallback: group words into ~10-word chunks
    const words = alternative.words;
    for (let i = 0; i < words.length; i += 10) {
      const chunk = words.slice(i, i + 10);
      const text = chunk.map(w => w.word || w.punctuated_word).join(' ');
      segments.push({
        id: `seg-${i}`,
        text,
        timestamp: Math.round((chunk[0].start || 0) * 1000),
        speaker: chunk[0].speaker !== undefined ? `Speaker ${chunk[0].speaker + 1}` : undefined,
      });
    }
  }

  return { transcript, segments };
}

async function processSubmission(submissionId: string, batchId: string): Promise<void> {
  const startTime = Date.now();
  const submission = await getSubmission(submissionId);
  if (!submission) {
    console.error(`[Worker] Submission ${submissionId} not found`);
    return;
  }

  console.log(`[Worker] START batchId=${batchId} submissionId=${submissionId} file=${submission.originalFilename}`);

  try {
    // Update status to transcribing
    await updateSubmission(submissionId, { 
      status: 'transcribing',
      startedAt: Date.now(),
    });

    // Get download URL for the file
    const downloadUrl = await getPresignedDownloadUrl(submission.fileKey);

    // Transcribe using URL
    console.log(`[Worker] Transcribing ${submissionId}...`);
    const transcribeStart = Date.now();
    const { transcript, segments } = await transcribeFromUrl(downloadUrl);
    console.log(`[Worker] Transcription complete for ${submissionId} in ${Date.now() - transcribeStart}ms`);

    if (!transcript || transcript.trim().length < 10) {
      throw new Error('Transcription returned empty or too short');
    }

    // Update with transcript
    await updateSubmission(submissionId, {
      transcript,
      transcriptSegments: segments,
      status: 'analyzing',
    });

    // Get batch settings for rubric
    const batch = await getBatch(submission.batchId);
    const rubricCriteria = batch?.rubricCriteria;

    // Extract slide content from video if Gemini is configured
    // This analyzes screen shares in Zoom recordings
    let slideContent: { slides: Array<{ slideNumber: number; timestamp: number; title?: string; textContent: string; keyPoints: string[]; visualElements?: string[]; dataOrCharts?: string[] }>; presentationType: string; summary: string } | null = null;
    let presentationContext = '';
    
    if (isGeminiConfigured()) {
      try {
        console.log(`[Worker] Extracting slide content from video ${submissionId}...`);
        const slideStart = Date.now();
        slideContent = await analyzeVideoForSlides(downloadUrl, submission.mimeType || 'video/mp4');
        console.log(`[Worker] Slide extraction complete: ${slideContent.slides.length} slides in ${Date.now() - slideStart}ms`);
        
        if (slideContent.slides.length > 0) {
          presentationContext = buildPresentationContext(slideContent.slides);
          console.log(`[Worker] Presentation context built: ${presentationContext.length} chars`);
        }
      } catch (slideErr) {
        console.error(`[Worker] Slide extraction failed (continuing without slides):`, slideErr);
      }
    }

    // Run analysis pipeline (if AI is configured)
    if (isClaudeConfigured()) {
      console.log(`[Worker] Analyzing ${submissionId}...`);
      const analyzeStart = Date.now();
      
      // 1. Analyze transcript with presentation context (required for other steps)
      const analysis = await analyzeWithClaude(transcript, presentationContext || undefined);
      console.log(`[Worker] Analysis complete for ${submissionId} in ${Date.now() - analyzeStart}ms`);
      
      // 2. Run rubric eval, questions, and verification in PARALLEL
      const claims = analysis.keyClaims.slice(0, config.limits.maxClaimsForVerification).map(c => c.claim);
      
      console.log(`[Worker] Starting parallel processing for ${submissionId}: rubric, questions, verification`);
      const parallelStart = Date.now();
      
      const [rubricResult, questionsResult, verifyResult] = await Promise.allSettled([
        evaluateWithClaude(transcript, rubricCriteria, undefined, analysis),
        generateQuestionsWithClaude(transcript, analysis, undefined, { maxQuestions: 5 }), // Generate 5 diverse question types
        claims.length > 0 ? verifyWithClaude(transcript, claims) : Promise.resolve([]),
      ]);

      console.log(`[Worker] Parallel processing complete for ${submissionId} in ${Date.now() - parallelStart}ms`);

      // Extract results
      const rubricEvaluation = rubricResult.status === 'fulfilled' ? rubricResult.value : null;
      const questions = questionsResult.status === 'fulfilled' ? questionsResult.value : [];
      const findings = verifyResult.status === 'fulfilled' ? verifyResult.value : [];

      const verificationFindings = findings.map(f => ({
        id: f.id,
        statement: f.statement,
        status: f.verdict,
        explanation: f.explanation,
      }));

      // Update submission with results
      await updateSubmission(submissionId, {
        analysis: {
          keyClaims: analysis.keyClaims.map(c => ({
            id: c.id,
            claim: c.claim,
            evidence: c.evidence,
          })),
          logicalGaps: analysis.logicalGaps.map(g => ({
            id: g.id,
            description: g.description,
            severity: g.severity,
          })),
          missingEvidence: analysis.missingEvidence.map(e => ({
            id: e.id,
            description: e.description,
          })),
          overallStrength: analysis.overallStrength,
        },
        rubricEvaluation: rubricEvaluation ? {
          overallScore: rubricEvaluation.overallScore,
          criteriaBreakdown: rubricEvaluation.criteriaBreakdown,
          strengths: rubricEvaluation.criteriaBreakdown?.flatMap(c => c.strengths || []) || [],
          improvements: rubricEvaluation.criteriaBreakdown?.flatMap(c => c.improvements || []) || [],
        } : undefined,
        questions: questions.slice(0, 8).map(q => ({
          id: q.id,
          question: q.question,
          category: q.category,
        })),
        verificationFindings,
        // Store extracted slide content for reference in feedback
        slideContent: slideContent && slideContent.slides.length > 0 ? {
          slides: slideContent.slides,
          presentationType: slideContent.presentationType,
          summary: slideContent.summary,
        } : undefined,
        status: 'ready',
        completedAt: Date.now(),
      });
    } else {
      // No AI - just save transcript
      await updateSubmission(submissionId, {
        status: 'ready',
        completedAt: Date.now(),
      });
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Worker] COMPLETE batchId=${batchId} submissionId=${submissionId} duration=${totalTime}ms`);

    // Update batch stats
    await updateBatchStats(submission.batchId);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[Worker] FAILED batchId=${batchId} submissionId=${submissionId} duration=${totalTime}ms error=${error instanceof Error ? error.message : 'Unknown'}`);
    
    await updateSubmission(submissionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: Date.now(),
    });

    // Update batch stats
    await updateBatchStats(submission.batchId);
  }
}

// POST /api/bulk/worker - Process queued submissions
// This can be triggered by external cron services, process-now endpoint, or manually
export async function POST(request: NextRequest) {
  const workerStartTime = Date.now();
  
  try {
    // Verify cron secret for security (supports header or query param)
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    
    // Auth check logging
    console.log(`[Worker] Auth check: cronSecret=${cronSecret ? 'SET' : 'NOT_SET'}, headerAuth=${authHeader ? 'present' : 'missing'}, querySecret=${querySecret ? 'present' : 'missing'}`);
    
    if (cronSecret && cronSecret.length > 0) {
      const headerMatch = authHeader === `Bearer ${cronSecret}`;
      const queryMatch = querySecret === cronSecret;
      
      if (!headerMatch && !queryMatch) {
        // In production, require auth when CRON_SECRET is configured
        if (process.env.NODE_ENV === 'production') {
          console.warn('[Worker] Unauthorized request - secret mismatch');
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        } else {
          console.log('[Worker] Skipping auth in development');
        }
      } else {
        console.log('[Worker] Auth verified successfully');
      }
    } else {
      console.log('[Worker] No CRON_SECRET configured - auth disabled');
    }

    const queueLength = await getQueueLength();
    console.log(`[Worker] Starting worker run. Queue length: ${queueLength}, Max per run: ${MAX_SUBMISSIONS_PER_RUN}`);

    const processed: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < MAX_SUBMISSIONS_PER_RUN; i++) {
      const submissionId = await getNextQueuedSubmission();
      if (!submissionId) {
        console.log('[Worker] Queue empty, stopping');
        break;
      }

      // Get submission to find batchId for logging
      const submission = await getSubmission(submissionId);
      const batchId = submission?.batchId || 'unknown';

      try {
        await processSubmission(submissionId, batchId);
        processed.push(submissionId);
      } catch (error) {
        errors.push({
          id: submissionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const workerDuration = Date.now() - workerStartTime;
    console.log(`[Worker] Worker run complete. Processed: ${processed.length}, Errors: ${errors.length}, Duration: ${workerDuration}ms`);

    return NextResponse.json({
      success: true,
      processed: processed.length,
      processedIds: processed,
      errors,
      duration: workerDuration,
    });
  } catch (error) {
    console.error('[Worker] Fatal error:', error);
    return NextResponse.json(
      { error: 'Worker failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/bulk/worker - Check worker status (for debugging)
export async function GET() {
  try {
    const queueLength = await getQueueLength();
    
    return NextResponse.json({
      success: true,
      queueLength,
      maxPerRun: MAX_SUBMISSIONS_PER_RUN,
      deepgramConfigured: !!process.env.DEEPGRAM_API_KEY,
      claudeConfigured: isClaudeConfigured(),
      cronSecretConfigured: !!process.env.CRON_SECRET,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check worker status' },
      { status: 500 }
    );
  }
}
