import { NextRequest, NextResponse } from 'next/server';
import { 
  getNextQueuedSubmission, 
  getSubmission, 
  updateSubmission, 
  updateBatchStats,
  getBatch,
  requeue
} from '@/lib/batch-store';
import { getPresignedDownloadUrl } from '@/lib/r2';
import { analyzeWithClaude, isClaudeConfigured, generateQuestionsWithClaude, evaluateWithClaude } from '@/lib/claude';
import { verifyWithClaude } from '@/lib/verify';
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

async function processSubmission(submissionId: string): Promise<void> {
  const submission = await getSubmission(submissionId);
  if (!submission) {
    console.error(`[Worker] Submission ${submissionId} not found`);
    return;
  }

  console.log(`[Worker] Processing submission ${submissionId} (${submission.originalFilename})`);

  try {
    // Update status to transcribing
    await updateSubmission(submissionId, { 
      status: 'transcribing',
      startedAt: Date.now(),
    });

    // Get download URL for the file
    const downloadUrl = await getPresignedDownloadUrl(submission.fileKey);

    // Transcribe using URL
    console.log(`[Worker] Transcribing ${submission.originalFilename}...`);
    const { transcript, segments } = await transcribeFromUrl(downloadUrl);

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

    // Run analysis pipeline (if Claude is configured)
    if (isClaudeConfigured()) {
      console.log(`[Worker] Analyzing ${submission.originalFilename}...`);
      
      // 1. Analyze transcript
      const analysis = await analyzeWithClaude(transcript);
      
      // 2. Evaluate with rubric
      const rubricEvaluation = await evaluateWithClaude(
        transcript,
        rubricCriteria,
        undefined, // customCriteria
        analysis
      );

      // 3. Generate questions (limited set)
      const questions = await generateQuestionsWithClaude(
        transcript, 
        analysis, 
        undefined, // no slide content
        { maxQuestions: config.limits.defaultMaxQuestions }
      );

      // 4. Verify key claims
      const claims = analysis.keyClaims.slice(0, config.limits.maxClaimsForVerification).map(c => c.claim);
      let verificationFindings: Array<{ id: string; statement: string; status: string; explanation: string }> = [];
      
      if (claims.length > 0) {
        try {
          const findings = await verifyWithClaude(transcript, claims);
          verificationFindings = findings.map(f => ({
            id: f.id,
            statement: f.statement,
            status: f.verdict, // verdict maps to status in our internal model
            explanation: f.explanation,
          }));
        } catch (e) {
          console.warn(`[Worker] Verification failed for ${submissionId}:`, e);
        }
      }

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
        rubricEvaluation: {
          overallScore: rubricEvaluation.overallScore,
          criteriaBreakdown: rubricEvaluation.criteriaBreakdown,
          // Extract strengths/improvements from criteria breakdown or use empty arrays
          strengths: rubricEvaluation.criteriaBreakdown?.flatMap(c => c.strengths || []) || [],
          improvements: rubricEvaluation.criteriaBreakdown?.flatMap(c => c.improvements || []) || [],
        },
        questions: questions.slice(0, 8).map(q => ({
          id: q.id,
          question: q.question,
          category: q.category,
        })),
        verificationFindings,
        status: 'ready',
        completedAt: Date.now(),
      });
    } else {
      // No Claude - just save transcript
      await updateSubmission(submissionId, {
        status: 'ready',
        completedAt: Date.now(),
      });
    }

    console.log(`[Worker] Completed processing ${submissionId}`);

    // Update batch stats
    await updateBatchStats(submission.batchId);

  } catch (error) {
    console.error(`[Worker] Error processing ${submissionId}:`, error);
    
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
// This can be triggered by external cron services or manually
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security (supports header or query param)
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret) {
      const headerMatch = authHeader === `Bearer ${cronSecret}`;
      const queryMatch = querySecret === cronSecret;
      
      if (!headerMatch && !queryMatch) {
        // Allow manual triggers without auth in development only
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    }

    const processed: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < MAX_SUBMISSIONS_PER_RUN; i++) {
      const submissionId = await getNextQueuedSubmission();
      if (!submissionId) {
        break; // Queue is empty
      }

      try {
        await processSubmission(submissionId);
        processed.push(submissionId);
      } catch (error) {
        errors.push({
          id: submissionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: processed.length,
      processedIds: processed,
      errors,
    });
  } catch (error) {
    console.error('[Worker] Error:', error);
    return NextResponse.json(
      { error: 'Worker failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/bulk/worker - Check worker status (for debugging)
export async function GET() {
  try {
    const { getQueueLength } = await import('@/lib/batch-store');
    const queueLength = await getQueueLength();
    
    return NextResponse.json({
      success: true,
      queueLength,
      deepgramConfigured: !!process.env.DEEPGRAM_API_KEY,
      claudeConfigured: isClaudeConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check worker status' },
      { status: 500 }
    );
  }
}

