export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getBatchSubmissions, getQueueLength, getSubmission } from '@/lib/batch-store';
import { kv } from '@vercel/kv';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Debug: Check raw KV state
    const rawSubmissionIds = await kv.smembers(`batch_submissions:${batchId}`);
    console.log(`[Status] BatchId=${batchId} Raw submission IDs in set:`, rawSubmissionIds);

    let submissions = await getBatchSubmissions(batchId);
    console.log(`[Status] BatchId=${batchId} Found ${submissions.length} submissions from set`);
    
    // If we have 0 submissions but batch says there are some, try to find them from queue
    if (submissions.length === 0 && batch.totalSubmissions > 0) {
      console.log(`[Status] Mismatch detected. Batch has ${batch.totalSubmissions} but found 0 submissions. Checking queue...`);
      
      // Try to get submissions from the queue
      const queueItems = await kv.lrange('submission_queue', 0, -1);
      console.log(`[Status] Queue items:`, queueItems);
      
      for (const subId of queueItems || []) {
        const sub = await getSubmission(subId as string);
        if (sub && sub.batchId === batchId) {
          submissions.push(sub);
          // Also fix the set
          await kv.sadd(`batch_submissions:${batchId}`, subId);
          console.log(`[Status] Recovered submission ${subId} and added to set`);
        }
      }
    }
    
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

