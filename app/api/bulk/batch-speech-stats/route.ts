export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatchSubmissions, Submission } from '@/lib/batch-store';

/**
 * Compute speech metrics from transcript data (same logic as UI).
 * This ensures averages work even if metrics weren't stored during grading.
 */
function computeSpeechMetrics(submission: Submission): { fillerWordCount: number; speakingRateWpm: number; pauseFrequency: number } | null {
  // Use stored metrics if available
  if (submission.analysis?.speechMetrics) {
    return submission.analysis.speechMetrics;
  }

  // Otherwise, calculate from transcript
  const transcript = submission.transcript || '';
  const segments = submission.transcriptSegments || [];

  if (!transcript && segments.length === 0) {
    return null;
  }

  // Get full transcript text
  const fullText = transcript || segments.map(s => s.text).join(' ');

  // Count words
  const words = fullText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) {
    return null;
  }

  // Count filler words
  const fillerPatterns = /\b(um|uh|like|you know|i mean|so|basically|actually|literally|right|okay|well)\b/gi;
  const fillerMatches = fullText.match(fillerPatterns);
  const fillerWordCount = fillerMatches ? fillerMatches.length : 0;

  // Calculate duration in minutes
  let durationMinutes = 1;
  if (submission.duration) {
    durationMinutes = submission.duration / 60;
  } else if (segments.length > 0) {
    // Estimate from last segment timestamp
    const lastTimestamp = Math.max(...segments.map(s => s.timestamp));
    // Assume milliseconds unless very small
    const lastMs = lastTimestamp > 36000 ? lastTimestamp : lastTimestamp * 1000;
    durationMinutes = Math.max(1, lastMs / 60000);
  }

  // Speaking rate (words per minute)
  const speakingRateWpm = Math.round(wordCount / durationMinutes);

  // Pause frequency (estimated from number of segments divided by duration)
  const pauseFrequency = parseFloat((segments.length / durationMinutes).toFixed(1));

  return { fillerWordCount, speakingRateWpm, pauseFrequency };
}

/**
 * GET /api/bulk/batch-speech-stats?batchId=xxx
 * Returns assignment-level speech metrics (averages) for the batch.
 * Used to show "Assignment avg" in Speech Delivery on submission pages.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const submissions = await getBatchSubmissions(batchId);
    
    // Compute metrics for each submission (from stored or transcript)
    const metricsArray: Array<{ fillerWordCount: number; speakingRateWpm: number; pauseFrequency: number }> = [];
    for (const s of submissions) {
      const metrics = computeSpeechMetrics(s);
      if (metrics) {
        metricsArray.push(metrics);
      }
    }

    if (metricsArray.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        fillerWordAvg: null,
        wpmAvg: null,
        pausesPerMinAvg: null,
      });
    }

    const fillerWordAvg = metricsArray.reduce((sum, m) => sum + m.fillerWordCount, 0) / metricsArray.length;
    const wpmAvg = metricsArray.reduce((sum, m) => sum + m.speakingRateWpm, 0) / metricsArray.length;
    const pausesPerMinAvg = metricsArray.reduce((sum, m) => sum + m.pauseFrequency, 0) / metricsArray.length;

    return NextResponse.json({
      success: true,
      count: metricsArray.length,
      fillerWordAvg: Math.round(fillerWordAvg * 10) / 10,
      wpmAvg: Math.round(wpmAvg),
      pausesPerMinAvg: Math.round(pausesPerMinAvg * 10) / 10,
    });
  } catch (error) {
    console.error('[BatchSpeechStats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch speech stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
