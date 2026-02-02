export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatchSubmissions } from '@/lib/batch-store';

/**
 * GET /api/bulk/batch-speech-stats?batchId=xxx
 * Returns class-level speech metrics (averages) for the batch.
 * Used to show "Class Avg" in Speech Delivery on submission pages.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const submissions = await getBatchSubmissions(batchId);
    const withMetrics = submissions.filter(
      (s) =>
        s.analysis?.speechMetrics &&
        typeof s.analysis.speechMetrics.fillerWordCount === 'number' &&
        typeof s.analysis.speechMetrics.speakingRateWpm === 'number' &&
        typeof s.analysis.speechMetrics.pauseFrequency === 'number'
    );

    if (withMetrics.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        fillerWordAvg: null,
        wpmAvg: null,
        pausesPerMinAvg: null,
      });
    }

    const fillerWordAvg =
      withMetrics.reduce((sum, s) => sum + (s.analysis!.speechMetrics!.fillerWordCount ?? 0), 0) / withMetrics.length;
    const wpmAvg =
      withMetrics.reduce((sum, s) => sum + (s.analysis!.speechMetrics!.speakingRateWpm ?? 0), 0) / withMetrics.length;
    const pausesPerMinAvg =
      withMetrics.reduce((sum, s) => sum + (s.analysis!.speechMetrics!.pauseFrequency ?? 0), 0) / withMetrics.length;

    return NextResponse.json({
      success: true,
      count: withMetrics.length,
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
