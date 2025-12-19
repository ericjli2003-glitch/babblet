'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Mic, MessageSquareText, User } from 'lucide-react';
import type { TranscriptSegment } from '@/lib/types';

// Highlight for any marker type (question, issue, insight)
interface MarkerHighlight {
  id: string;
  snippet: string;
  label: string; // Truncated text for hover tooltip
  fullText?: string; // Full text for popup
  type: 'question' | 'issue' | 'insight';
}

// Legacy export for backward compatibility
interface QuestionHighlight {
  snippet: string;
  question: string;
  questionId: string;
}

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  currentTime?: number;
  // All marker highlights (questions, issues, insights)
  markerHighlights?: MarkerHighlight[];
  // Toggle visibility per type
  showQuestions?: boolean;
  showIssues?: boolean;
  showInsights?: boolean;
  // Temporary highlight when hovering timeline marker (overrides toggles)
  hoveredMarkerId?: string | null;
  // Click handler
  onHighlightClick?: (markerId: string) => void;
  interimText?: string;
  // Legacy props for backward compatibility
  questionHighlights?: QuestionHighlight[];
  showQuestionHighlights?: boolean;
  onQuestionHighlightClick?: (questionId: string) => void;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFuzzySnippetRegex(snippet: string): RegExp | null {
  const normalized = normalizeForMatch(snippet);
  if (!normalized) return null;
  const words = normalized.split(' ').filter(Boolean);
  if (words.length < 2) return null;

  // Allow punctuation/whitespace differences between words
  // Use word boundaries (\b) to ensure we only match complete words
  const sep = `[\\s\\.,;:!\\?\\\"\\'\\(\\)\\[\\]\\-]*`;
  // Add word boundary at start and end to prevent matching inside words
  const pattern = `\\b(${words.map(escapeRegex).join(sep)})\\b`;
  try {
    return new RegExp(pattern, 'gi');
  } catch {
    return null;
  }
}

// Expand a position in text to the nearest word boundary
function expandToWordBoundary(text: string, start: number, end: number): { start: number; end: number } {
  // Expand start backwards to beginning of word
  let newStart = start;
  while (newStart > 0 && /\w/.test(text[newStart - 1])) {
    newStart--;
  }

  // Expand end forwards to end of word
  let newEnd = end;
  while (newEnd < text.length && /\w/.test(text[newEnd])) {
    newEnd++;
  }

  return { start: newStart, end: newEnd };
}

// Speaker colors for differentiation
const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Speaker 1': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'Speaker 2': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Speaker 3': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Speaker 4': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'default': { bg: 'bg-surface-50', text: 'text-surface-700', border: 'border-surface-200' },
};

function getSpeakerColor(speaker?: string) {
  if (!speaker) return SPEAKER_COLORS['default'];
  return SPEAKER_COLORS[speaker] || SPEAKER_COLORS['default'];
}

export default function TranscriptFeed({
  segments,
  isLive = false,
  currentTime = 0,
  markerHighlights = [],
  showQuestions = false,
  showIssues = false,
  showInsights = false,
  hoveredMarkerId,
  onHighlightClick,
  interimText = '',
  // Legacy props
  questionHighlights = [],
  showQuestionHighlights = false,
  onQuestionHighlightClick,
}: TranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [hoveredHighlight, setHoveredHighlight] = useState<{ label: string; fullText?: string; type: string; x: number; y: number } | null>(null);

  // Merge legacy questionHighlights into markerHighlights
  const allHighlights: MarkerHighlight[] = [
    ...markerHighlights,
    ...questionHighlights.map(q => ({
      id: q.questionId,
      snippet: q.snippet,
      label: q.question,
      type: 'question' as const,
    })),
  ];

  // Dedupe by id
  const uniqueHighlights = allHighlights.filter((h, i, arr) =>
    arr.findIndex(x => x.id === h.id) === i
  );

  // Merge legacy toggle
  const effectiveShowQuestions = showQuestions || showQuestionHighlights;

  // Group segments by speaker for display
  const hasSpeakers = segments.some(s => s.speaker);

  // Combine all segments into a single paragraph (for non-speaker mode)
  const fullTranscript = segments.map(s => s.text).join(' ').trim();
  const wordCount = fullTranscript ? fullTranscript.split(/\s+/).length : 0;

  // Display text includes interim (real-time) transcription
  const hasInterim = interimText.trim().length > 0;

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [fullTranscript, isLive]);

  // Auto-scroll to hovered marker highlight
  useEffect(() => {
    if (hoveredMarkerId && highlightRefs.current.has(hoveredMarkerId)) {
      const el = highlightRefs.current.get(hoveredMarkerId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [hoveredMarkerId]);

  // Get bracket/text colors by type - using brackets instead of background highlights
  const getBracketColors = (type: 'question' | 'issue' | 'insight') => {
    switch (type) {
      case 'question':
        return { bracket: 'text-violet-500', text: 'text-violet-700' };
      case 'issue':
        return { bracket: 'text-amber-500', text: 'text-amber-700' };
      case 'insight':
        return { bracket: 'text-emerald-500', text: 'text-emerald-700' };
    }
  };

  // Build a single-pass regex from all active highlights
  const buildSinglePassHighlighter = () => {
    // Filter highlights based on toggles (or if it's the hovered marker)
    const activeHighlights = uniqueHighlights.filter(h => {
      // Always show if this is the hovered marker
      if (h.id === hoveredMarkerId) return true;
      // Otherwise respect toggles
      switch (h.type) {
        case 'question': return effectiveShowQuestions;
        case 'issue': return showIssues;
        case 'insight': return showInsights;
      }
    });

    if (activeHighlights.length === 0) return null;

    // Sort by snippet length descending to match longer phrases first
    const sorted = [...activeHighlights].sort((a, b) => b.snippet.length - a.snippet.length);

    return { highlights: sorted };
  };

  // Render text with highlights using single-pass approach
  const renderHighlightedText = (text: string) => {
    const highlighter = buildSinglePassHighlighter();
    if (!highlighter) return text;

    const { highlights } = highlighter;

    // Build array of { start, end, highlight } for all matches
    type MatchRange = { start: number; end: number; highlight: MarkerHighlight };
    const matches: MatchRange[] = [];

    const normalizedText = normalizeForMatch(text);

    for (const h of highlights) {
      if (!h.snippet || h.snippet.length < 5) continue;

      const pattern = buildFuzzySnippetRegex(h.snippet);
      if (!pattern) continue;

      // Find all matches in normalized text
      let match;
      const normalizedPattern = new RegExp(pattern.source, 'gi');
      while ((match = normalizedPattern.exec(normalizedText)) !== null) {
        // Check for overlap with existing matches
        const start = match.index;
        const end = match.index + match[0].length;

        const hasOverlap = matches.some(m =>
          (start >= m.start && start < m.end) ||
          (end > m.start && end <= m.end) ||
          (start <= m.start && end >= m.end)
        );

        if (!hasOverlap) {
          matches.push({ start, end, highlight: h });
        }
      }
    }

    if (matches.length === 0) return text;

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Now we need to map normalized positions back to original text
    // Build the result by walking through original text
    const result: React.ReactNode[] = [];
    let keyIndex = 0;
    let lastEnd = 0;

    // Create normalized-to-original position mapping
    const normalizedToOriginal: number[] = [];
    let ni = 0;
    for (let oi = 0; oi < text.length; oi++) {
      const char = text[oi];
      const normalizedChar = normalizeForMatch(char);
      if (normalizedChar.length > 0) {
        normalizedToOriginal[ni] = oi;
        ni++;
      }
    }
    normalizedToOriginal[ni] = text.length; // End marker

    for (const m of matches) {
      const rawOrigStart = normalizedToOriginal[m.start] ?? 0;
      const rawOrigEnd = normalizedToOriginal[m.end] ?? text.length;

      // Expand to full word boundaries to avoid cutting words in half
      const { start: origStart, end: origEnd } = expandToWordBoundary(text, rawOrigStart, rawOrigEnd);

      // Skip if this would overlap with what we've already processed
      if (origStart < lastEnd) continue;

      // Add text before this match
      if (origStart > lastEnd) {
        result.push(text.slice(lastEnd, origStart));
      }

      const matchedText = text.slice(origStart, origEnd);
      const isHovered = m.highlight.id === hoveredMarkerId;
      const colors = getBracketColors(m.highlight.type);

      // Use bracket notation instead of background highlight
      result.push(
        <span
          key={`hl-${keyIndex++}`}
          ref={(el) => {
            if (el) highlightRefs.current.set(m.highlight.id, el);
          }}
          className={`cursor-pointer transition-all inline ${isHovered
            ? 'scale-105 font-bold'
            : 'hover:font-semibold'
            }`}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredHighlight({
              label: m.highlight.label,
              fullText: m.highlight.fullText,
              type: m.highlight.type,
              x: rect.left + rect.width / 2,
              y: rect.top
            });
          }}
          onMouseLeave={() => setHoveredHighlight(null)}
          onClick={() => {
            onHighlightClick?.(m.highlight.id);
            onQuestionHighlightClick?.(m.highlight.id);
          }}
        >
          <span className={`${colors.bracket} font-bold ${isHovered ? 'text-lg' : 'text-base'}`}>[</span>
          <span className={`${colors.text} ${isHovered ? 'text-lg font-bold underline decoration-2' : ''}`}>
            {matchedText}
          </span>
          <span className={`${colors.bracket} font-bold ${isHovered ? 'text-lg' : 'text-base'}`}>]</span>
        </span>
      );

      lastEnd = origEnd;
    }

    // Add remaining text
    if (lastEnd < text.length) {
      result.push(text.slice(lastEnd));
    }

    return result;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-surface-900">Live Transcript</h3>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium">
              <span className="pulse-dot" />
              <span>Live</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Highlight counts per type */}
          {effectiveShowQuestions && uniqueHighlights.filter(h => h.type === 'question').length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-xs font-medium">
              <MessageSquareText className="w-3 h-3" />
              <span>{uniqueHighlights.filter(h => h.type === 'question').length} Q</span>
            </div>
          )}
          {showIssues && uniqueHighlights.filter(h => h.type === 'issue').length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
              <span className="text-xs">⚠️</span>
              <span>{uniqueHighlights.filter(h => h.type === 'issue').length}</span>
            </div>
          )}
          {showInsights && uniqueHighlights.filter(h => h.type === 'insight').length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              <span className="text-xs">💡</span>
              <span>{uniqueHighlights.filter(h => h.type === 'insight').length}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-sm text-surface-500">
            <Clock className="w-4 h-4" />
            <span>{formatTimestamp(currentTime)}</span>
          </div>
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 scrollbar-hide"
      >
        {!fullTranscript && !hasInterim ? (
          <div className="h-full flex flex-col items-center justify-center text-surface-400">
            <Mic className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">
              {isLive ? 'Waiting for audio...' : 'No transcript available'}
            </p>
            {isLive && (
              <p className="text-xs mt-1 text-surface-300">
                Start speaking to see the transcript
              </p>
            )}
          </div>
        ) : hasSpeakers ? (
          // Speaker-differentiated view
          <div className="space-y-3">
            {segments.map((segment, index) => {
              const colors = getSpeakerColor(segment.speaker);
              const isNewSpeaker = index === 0 || segments[index - 1].speaker !== segment.speaker;

              return (
                <motion.div
                  key={segment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${isNewSpeaker ? 'mt-4' : ''}`}
                >
                  {isNewSpeaker && segment.speaker && (
                    <div className={`flex items-center gap-2 mb-1.5 ${colors.text}`}>
                      <User className="w-4 h-4" />
                      <span className="text-sm font-medium">{segment.speaker}</span>
                      <span className="text-xs text-surface-400">
                        {formatTimestamp(segment.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className={`pl-6 py-1 border-l-2 ${colors.border}`}>
                    <p className="text-surface-700 text-base leading-relaxed">
                      {renderHighlightedText(segment.text)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          // Single paragraph view
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-sm max-w-none"
          >
            <p className="text-surface-700 text-base leading-relaxed whitespace-pre-wrap">
              {renderHighlightedText(fullTranscript)}
              {hasInterim && (
                <span className="text-surface-400 italic">
                  {fullTranscript ? ' ' : ''}{interimText}
                </span>
              )}
              {isLive && (
                <span className="inline-flex items-center ml-1">
                  <span className="w-0.5 h-4 bg-primary-500 animate-pulse" />
                </span>
              )}
            </p>
          </motion.div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Highlight Hover Tooltip */}
      <AnimatePresence>
        {hoveredHighlight && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="fixed z-50 pointer-events-none"
            style={{
              left: hoveredHighlight.x,
              top: hoveredHighlight.y - 10,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-surface-900 text-white px-3 py-2 rounded-lg shadow-xl max-w-md">
              <div className="flex items-center gap-2 mb-1">
                {hoveredHighlight.type === 'question' && (
                  <>
                    <MessageSquareText className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs text-violet-400 font-medium">Question</span>
                  </>
                )}
                {hoveredHighlight.type === 'issue' && (
                  <>
                    <span className="text-sm">⚠️</span>
                    <span className="text-xs text-amber-400 font-medium">Issue</span>
                  </>
                )}
                {hoveredHighlight.type === 'insight' && (
                  <>
                    <span className="text-sm">💡</span>
                    <span className="text-xs text-emerald-400 font-medium">Insight</span>
                  </>
                )}
              </div>
              <p className="text-sm leading-relaxed">
                {(hoveredHighlight.fullText || hoveredHighlight.label).slice(0, 150)}
                {(hoveredHighlight.fullText || hoveredHighlight.label).length > 150 ? '...' : ''}
              </p>
              {(hoveredHighlight.fullText || hoveredHighlight.label).length > 100 && (
                <p className="text-xs text-surface-400 mt-1">Click for full details</p>
              )}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-6 border-r-6 border-t-6 border-l-transparent border-r-transparent border-t-surface-900" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer with word count */}
      <div className="px-4 py-2 border-t border-surface-100 bg-surface-50/50">
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
            {hasSpeakers && ` • ${new Set(segments.map(s => s.speaker).filter(Boolean)).size} speaker${new Set(segments.map(s => s.speaker).filter(Boolean)).size !== 1 ? 's' : ''}`}
          </span>
          <span>
            {wordCount} word{wordCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export type { QuestionHighlight, MarkerHighlight };
