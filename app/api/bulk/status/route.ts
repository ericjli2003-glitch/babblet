export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getQueueLength, getSubmission, updateBatch, updateBatchStats } from '@/lib/batch-store';
import { kv } from '@vercel/kv';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    let batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Pull submission IDs directly from the KV set for consistency
    const submissionIds = await kv.smembers(`batch_submissions:${batchId}`) as string[];
    console.log(`[Status] BatchId=${batchId} Raw submission IDs in set:`, submissionIds);
    let submissions = (await Promise.all(submissionIds.map(id => getSubmission(id)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getSubmission>>>[];
    console.log(`[Status] BatchId=${batchId} Found ${submissions.length} submissions from set`);
    
    // If submissions are missing vs batch stats, try to recover
    if (batch.totalSubmissions > submissions.length) {
      console.log(`[Status] Mismatch detected. Batch has ${batch.totalSubmissions} but found ${submissions.length} submissions.`);
      
      // Try 1: Check the queue for queued submissions
      const queueItems = await kv.lrange('submission_queue', 0, -1);
      console.log(`[Status] Queue items:`, queueItems);
      
      for (const subId of queueItems || []) {
        const sub = await getSubmission(subId as string);
        if (sub && sub.batchId === batchId) {
          submissions.push(sub);
          await kv.sadd(`batch_submissions:${batchId}`, subId);
          console.log(`[Status] Recovered submission ${subId} from queue`);
        }
      }
      
      // Try 2: Scan for submission keys (expensive but necessary for recovery)
      if (batch.totalSubmissions > submissions.length) {
        console.log(`[Status] Scanning for orphaned submissions...`);
        let cursor = 0;
        let scanCount = 0;
        const maxScans = 10; // Limit scans to avoid timeout
        
        do {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: [number, string[]] = await kv.scan(cursor, { match: 'submission:*', count: 100 }) as any;
          cursor = result[0];
          const keys = result[1];
          
          for (const key of keys) {
            const subId = key.replace('submission:', '');
            const sub = await getSubmission(subId);
            if (sub && sub.batchId === batchId) {
              submissions.push(sub);
              await kv.sadd(`batch_submissions:${batchId}`, subId);
              console.log(`[Status] Recovered orphaned submission ${subId}`);
            }
          }
          
          scanCount++;
        } while (cursor !== 0 && scanCount < maxScans);
      }
      
      // Sync batch stats to recovered submissions
      if (submissions.length > 0) {
        await updateBatchStats(batchId);
        batch = await getBatch(batchId) || batch;
      }
      // NOTE: If still 0 submissions, leave batch stats as-is
      // Don't reset to 0 - data might be temporarily unavailable due to eventual consistency
    }
    
    // De-duplicate in case recovery added duplicates
    const deduped = new Map(submissions.map(s => [s.id, s]));
    submissions = Array.from(deduped.values());

    const queueLength = await getQueueLength();

    // Calculate stats
    const stats = {
      total: submissions.length,
      queued: submissions.filter(s => s.status === 'queued').length,
      uploading: submissions.filter(s => s.status === 'uploading').length,
      transcribing: submissions.filter(s => s.status === 'transcribing').length,
      analyzing: submissions.filter(s => s.status === 'analyzing').length,
      ready: submissions.filter(s => s.status === 'ready').length,
      failed: submissions.filter(s => s.status === 'failed').length,
    };

    return NextResponse.json({
      success: true,
      batch,
      submissions: submissions.map(s => ({
        id: s.id,
        studentName: s.studentName,
        originalFilename: s.originalFilename,
        status: s.status,
        errorMessage: s.errorMessage,
        overallScore: s.rubricEvaluation?.overallScore,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
      stats,
      globalQueueLength: queueLength,
    });
  } catch (error) {
    console.error('[Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

