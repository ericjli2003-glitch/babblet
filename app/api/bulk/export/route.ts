export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getBatchSubmissions } from '@/lib/batch-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const format = searchParams.get('format') || 'csv';

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await getBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const submissions = await getBatchSubmissions(batchId);

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        batch,
        submissions,
      });
    }

    // Generate CSV
    const headers = [
      'Student Name',
      'File Name',
      'Status',
      'Overall Score',
      'Strengths',
      'Improvements',
      'Key Claims',
      'Logical Gaps',
      'Missing Evidence',
      'Questions',
      'Completed At',
    ];

    const rows = submissions.map(s => {
      const score = s.rubricEvaluation?.overallScore?.toFixed(1) || '';
      const strengths = s.rubricEvaluation?.strengths?.join('; ') || '';
      const improvements = s.rubricEvaluation?.improvements?.join('; ') || '';
      const claims = s.analysis?.keyClaims?.map(c => c.claim).join('; ') || '';
      const gaps = s.analysis?.logicalGaps?.map(g => g.description).join('; ') || '';
      const missing = s.analysis?.missingEvidence?.map(e => e.description).join('; ') || '';
      const questions = s.questions?.map(q => q.question).join('; ') || '';
      const completedAt = s.completedAt ? new Date(s.completedAt).toISOString() : '';

      return [
        escapeCsv(s.studentName),
        escapeCsv(s.originalFilename),
        s.status,
        score,
        escapeCsv(strengths),
        escapeCsv(improvements),
        escapeCsv(claims),
        escapeCsv(gaps),
        escapeCsv(missing),
        escapeCsv(questions),
        completedAt,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Return as downloadable CSV
    const filename = `${batch.name.replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
    
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function escapeCsv(value: string): string {
  if (!value) return '';
  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

