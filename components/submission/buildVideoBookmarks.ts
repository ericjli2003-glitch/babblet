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

function findSegmentForText(text: string, segments: SegmentLike[]): { index: number; segment: SegmentLike } | null {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0 || segments.length === 0) return null;

  // Try to find a segment that shares several significant words with the feedback text
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < segments.length; i++) {
    const segLower = segments[i].text.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (segLower.includes(w)) score++;
    }
    if (score > bestScore && score >= 3) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? { index: bestIdx, segment: segments[bestIdx] } : null;
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
      } else if (text && sortedSegments.length > 0) {
        // Fallback: match feedback text against transcript segments
        const match = findSegmentForText(text, sortedSegments);
        if (match) {
          const rawTs = match.segment.timestamp;
          const ts = typeof rawTs === 'number' ? normalizeTimestamp(rawTs) : parseTimestampStr(String(rawTs));
          items.push({
            id: `${type}-${criterion ?? 'top'}-${i}-fallback`,
            timestampMs: ts,
            timestampLabel: fmtMs(ts),
            type,
            title: type === 'strength' ? 'Strength' : 'Area for Improvement',
            text,
            snippet: match.segment.text.slice(0, 120),
            criterion,
          });
        }
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
      } else if (c.feedback && sortedSegments.length > 0) {
        // Fallback: match criterion feedback against transcript
        const match = findSegmentForText(c.feedback, sortedSegments);
        if (match) {
          const rawTs = match.segment.timestamp;
          const ts = typeof rawTs === 'number' ? normalizeTimestamp(rawTs) : parseTimestampStr(String(rawTs));
          items.push({
            id: `rubric-${c.criterion}-fallback`,
            timestampMs: ts,
            timestampLabel: fmtMs(ts),
            type: 'rubric',
            title: c.criterion,
            text: c.feedback,
            snippet: match.segment.text.slice(0, 120),
            criterion: c.criterion,
          });
        }
      }
    });
  }

  // Fallback to top-level strengths/improvements if nothing from criteria
  if (items.filter(i => i.type === 'strength' || i.type === 'improvement').length === 0 && rubric) {
    pushRefs(rubric.strengths || [], 'strength');
    pushRefs(rubric.improvements || [], 'improvement');
  }

  // ── Questions ── (match to relevant transcript segment via snippet text)
  if (submission.questions?.length && sortedSegments.length > 0) {
    submission.questions.forEach((q) => {
      let ts: number | null = null;
      let matchedSnippet: string | undefined;

      // Try to find the segment that matches this question's relevantSnippet
      if (q.relevantSnippet) {
        const needle = q.relevantSnippet.trim().slice(0, 60).toLowerCase();
        if (needle.length >= 10) {
          for (let si = 0; si < sortedSegments.length; si++) {
            const segText = sortedSegments[si].text.toLowerCase();
            if (segText.includes(needle.slice(0, 40)) || segText.includes(needle.slice(0, 25))) {
              const seg = sortedSegments[si];
              const rawTs = seg.timestamp;
              ts = typeof rawTs === 'number' ? normalizeTimestamp(rawTs) : parseTimestampStr(String(rawTs));
              matchedSnippet = seg.text.slice(0, 120);
              break;
            }
          }
        }
      }

      // Only create a bookmark if we found a relevant segment
      if (ts != null) {
        items.push({
          id: `question-${q.id}`,
          timestampMs: ts,
          timestampLabel: fmtMs(ts),
          type: 'question',
          title: 'Follow-up Question',
          text: q.question,
          snippet: q.relevantSnippet || matchedSnippet,
          category: q.category,
        });
      }
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
