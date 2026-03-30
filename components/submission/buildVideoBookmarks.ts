/**
 * Utility to build VideoBookmark arrays from submission and trial data.
 */

export type BookmarkType = 'strength' | 'improvement' | 'question' | 'rubric';

export interface VideoBookmark {
  id: string;
  timestampMs: number;
  timestampLabel: string;
  type: BookmarkType;
  title: string;
  text: string;
  snippet?: string;
  criterion?: string;
  category?: string;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function parseTimestampStr(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

// ─── Builder for SubmissionDetail page ──────────────────────────────────────

interface SubmissionForBookmarks {
  rubricEvaluation?: {
    strengths: Array<string | { text?: string; transcriptRefs?: Array<{ timestamp: number; snippet?: string }> }>;
    improvements: Array<string | { text?: string; transcriptRefs?: Array<{ timestamp: number; snippet?: string }> }>;
    criteriaBreakdown?: Array<{
      criterion: string;
      score: number;
      maxScore?: number;
      feedback: string;
      transcriptRefs?: Array<{ timestamp: number; snippet?: string }>;
      strengths?: Array<string | { text?: string; transcriptRefs?: Array<{ timestamp: number; snippet?: string }> }>;
      improvements?: Array<string | { text?: string; transcriptRefs?: Array<{ timestamp: number; snippet?: string }> }>;
    }>;
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
    relevantSnippet?: string;
  }>;
}

interface SegmentLike {
  timestamp: number | string;
  text: string;
}

export function buildBookmarksFromSubmission(
  submission: SubmissionForBookmarks,
  normalizeTimestamp: (t: number) => number,
  sortedSegments: SegmentLike[],
): VideoBookmark[] {
  const items: VideoBookmark[] = [];
  const rubric = submission.rubricEvaluation;

  // ── Strengths & improvements from criteria ──
  const pushRefs = (
    arr: Array<string | { text?: string; transcriptRefs?: Array<{ timestamp: number; snippet?: string }> }>,
    type: 'strength' | 'improvement',
    criterion?: string,
  ) => {
    (arr || []).forEach((item, i) => {
      if (!item) return;
      const text = typeof item === 'string' ? item : (item.text ?? '');
      const refs = typeof item === 'object' ? item.transcriptRefs : undefined;
      if (refs?.length) {
        refs.forEach((ref) => {
          if (typeof ref.timestamp === 'number' && ref.timestamp >= 0) {
            items.push({
              id: `${type}-${criterion ?? 'top'}-${i}-${ref.timestamp}`,
              timestampMs: ref.timestamp,
              timestampLabel: fmtMs(ref.timestamp),
              type,
              title: type === 'strength' ? 'Strength' : 'Area for Improvement',
              text,
              snippet: ref.snippet,
              criterion,
            });
          }
        });
      }
    });
  };

  if (rubric?.criteriaBreakdown?.length) {
    rubric.criteriaBreakdown.forEach((c) => {
      // Per-criterion strengths/improvements
      pushRefs(c.strengths || [], 'strength', c.criterion);
      pushRefs(c.improvements || [], 'improvement', c.criterion);

      // Rubric criterion-level transcript refs
      if (c.transcriptRefs?.length) {
        c.transcriptRefs.forEach((ref, ri) => {
          items.push({
            id: `rubric-${c.criterion}-${ri}`,
            timestampMs: ref.timestamp,
            timestampLabel: fmtMs(ref.timestamp),
            type: 'rubric',
            title: c.criterion,
            text: c.feedback,
            snippet: ref.snippet,
            criterion: c.criterion,
          });
        });
      }
    });
  }

  // Fallback to top-level strengths/improvements if nothing from criteria
  if (items.filter(i => i.type === 'strength' || i.type === 'improvement').length === 0 && rubric) {
    pushRefs(rubric.strengths || [], 'strength');
    pushRefs(rubric.improvements || [], 'improvement');
  }

  // ── Questions ── (estimate timestamp by distributing across segments)
  if (submission.questions?.length && sortedSegments.length > 0) {
    const qLen = submission.questions.length;
    submission.questions.forEach((q, i) => {
      const segIdx = Math.min(Math.floor((i / qLen) * sortedSegments.length), sortedSegments.length - 1);
      const seg = sortedSegments[segIdx];
      const rawTs = seg?.timestamp;
      const ts = rawTs != null
        ? (typeof rawTs === 'number' ? normalizeTimestamp(rawTs) : parseTimestampStr(rawTs))
        : (i + 1) * 60000;
      items.push({
        id: `question-${q.id}`,
        timestampMs: ts,
        timestampLabel: fmtMs(ts),
        type: 'question',
        title: 'Follow-up Question',
        text: q.question,
        snippet: q.relevantSnippet || seg?.text?.slice(0, 100),
        category: q.category,
      });
    });
  }

  return items;
}

// ─── Builder for Try page ───────────────────────────────────────────────────

interface TryResult {
  strengths: Array<{ text: string; quote: string }>;
  improvements: Array<{ text: string; quote: string }>;
  questions: Array<{ question: string; category: string; rationale: string; timestamp: string }>;
  transcript?: Array<{ timestamp: string; text: string }>;
}

function findSegIdx(quote: string, segments: { text: string }[]): number {
  const q = quote.trim().slice(0, 80).toLowerCase();
  if (!q) return -1;
  for (let i = 0; i < segments.length; i++) {
    const t = segments[i].text.toLowerCase();
    if (t.includes(q.slice(0, 40)) || (q.slice(0, 30).length >= 12 && t.includes(q.slice(0, 30)))) return i;
  }
  return -1;
}

export function buildBookmarksFromTryResult(
  result: TryResult,
  transcript: Array<{ timestamp: string; text: string }>,
): VideoBookmark[] {
  const items: VideoBookmark[] = [];

  // Strengths
  result.strengths.forEach((s, i) => {
    const segIdx = findSegIdx(s.quote, transcript);
    if (segIdx >= 0 && transcript[segIdx]) {
      const ms = parseTimestampStr(transcript[segIdx].timestamp);
      items.push({
        id: `try-strength-${i}`,
        timestampMs: ms,
        timestampLabel: transcript[segIdx].timestamp,
        type: 'strength',
        title: 'Strength',
        text: s.text,
        snippet: s.quote.slice(0, 130),
      });
    }
  });

  // Improvements
  result.improvements.forEach((s, i) => {
    const segIdx = findSegIdx(s.quote, transcript);
    if (segIdx >= 0 && transcript[segIdx]) {
      const ms = parseTimestampStr(transcript[segIdx].timestamp);
      items.push({
        id: `try-improvement-${i}`,
        timestampMs: ms,
        timestampLabel: transcript[segIdx].timestamp,
        type: 'improvement',
        title: 'Area for Improvement',
        text: s.text,
        snippet: s.quote.slice(0, 130),
      });
    }
  });

  // Questions (have explicit timestamps)
  result.questions.forEach((q, i) => {
    const ms = parseTimestampStr(q.timestamp || '0:00');
    items.push({
      id: `try-question-${i}`,
      timestampMs: ms,
      timestampLabel: q.timestamp || '0:00',
      type: 'question',
      title: 'Follow-up Question',
      text: q.question,
      category: q.category,
    });
  });

  return items;
}
