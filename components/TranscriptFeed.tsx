'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Mic, MessageSquareText, User } from 'lucide-react';
import type { TranscriptSegment } from '@/lib/types';

// Common stopwords to exclude from highlighting
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which', 'who', 'whom', 'whose',
  'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if', 'because',
  'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'under', 'again', 'further', 'while', 'really', 'actually', 'basically', 'like', 'kind',
  'sort', 'thing', 'things', 'something', 'anything', 'everything', 'nothing'
]);

// Question highlight with associated question text
interface QuestionHighlight {
  snippet: string;
  question: string;
  questionId: string;
}

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  currentTime?: number;
  highlightKeywords?: string[];
  questionHighlights?: QuestionHighlight[]; // Snippets with their questions
  interimText?: string;
  showQuestionHighlights?: boolean; // Toggle for yellow highlights
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

function cleanKeywords(keywords: string[]): string[] {
  return Array.from(new Set(
    keywords
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length >= 4)
      .filter(k => !STOPWORDS.has(k))
      .filter(k => /^[a-z]/i.test(k))
  ));
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
  highlightKeywords = [],
  questionHighlights = [],
  interimText = '',
  showQuestionHighlights = false,
  onQuestionHighlightClick,
}: TranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredQuestion, setHoveredQuestion] = useState<{ question: string; x: number; y: number } | null>(null);

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

  // Render text with highlights
  const renderHighlightedText = (text: string) => {
    const cleanedKeywords = cleanKeywords(highlightKeywords);
    
    // If no highlights needed, return plain text
    if (cleanedKeywords.length === 0 && (!showQuestionHighlights || questionHighlights.length === 0)) {
      return text;
    }

    let result: React.ReactNode[] = [text];
    let keyIndex = 0;

    // First, apply question highlights (yellow) if enabled
    if (showQuestionHighlights && questionHighlights.length > 0) {
      questionHighlights.forEach(({ snippet, question, questionId }) => {
        if (!snippet || snippet.length < 5) return;
        
        const newResult: React.ReactNode[] = [];
        const pattern = new RegExp(`(${escapeRegex(snippet)})`, 'gi');
        
        result.forEach(part => {
          if (typeof part !== 'string') {
            newResult.push(part);
            return;
          }
          
          const splitParts = part.split(pattern);
          
          splitParts.forEach((subPart, i) => {
            if (!subPart) return;
            
            const isMatch = subPart.toLowerCase() === snippet.toLowerCase();
            if (isMatch) {
              newResult.push(
                <mark
                  key={`q-${keyIndex++}`}
                  className="bg-yellow-200 text-yellow-900 px-1 rounded font-medium cursor-pointer hover:bg-yellow-300 transition-colors relative"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredQuestion({ question, x: rect.left + rect.width / 2, y: rect.top });
                  }}
                  onMouseLeave={() => setHoveredQuestion(null)}
                  onClick={() => onQuestionHighlightClick?.(questionId)}
                >
                  {subPart}
                </mark>
              );
            } else {
              newResult.push(subPart);
            }
          });
        });
        
        result = newResult;
      });
    }

    // Then, apply keyword highlights (blue)
    if (cleanedKeywords.length > 0) {
      const sorted = cleanedKeywords.sort((a, b) => b.length - a.length);
      const pattern = new RegExp(`\\b(${sorted.map(escapeRegex).join('|')})\\b`, 'gi');
      
      const newResult: React.ReactNode[] = [];
      
      result.forEach(part => {
        if (typeof part !== 'string') {
          newResult.push(part);
          return;
        }
        
        const splitParts = part.split(pattern);
        
        splitParts.forEach((subPart) => {
          if (!subPart) return;
          
          const isKeyword = cleanedKeywords.some(k => k.toLowerCase() === subPart.toLowerCase());
          if (isKeyword) {
            newResult.push(
              <mark key={`k-${keyIndex++}`} className="bg-primary-100 text-primary-700 px-1 rounded font-medium">
                {subPart}
              </mark>
            );
          } else {
            newResult.push(subPart);
          }
        });
      });
      
      result = newResult;
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
          {/* Question highlights indicator */}
          {showQuestionHighlights && questionHighlights.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">
              <MessageSquareText className="w-3 h-3" />
              <span>{questionHighlights.length} Q</span>
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

      {/* Question Hover Tooltip */}
      <AnimatePresence>
        {hoveredQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="fixed z-50 pointer-events-none"
            style={{
              left: hoveredQuestion.x,
              top: hoveredQuestion.y - 10,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-surface-900 text-white px-3 py-2 rounded-lg shadow-xl max-w-sm">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquareText className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs text-yellow-400 font-medium">Question</span>
              </div>
              <p className="text-sm">{hoveredQuestion.question}</p>
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

export type { QuestionHighlight };
