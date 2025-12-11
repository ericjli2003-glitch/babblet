'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, User, Mic } from 'lucide-react';
import type { TranscriptSegment } from '@/lib/types';

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  currentTime?: number;
  highlightKeywords?: string[];
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function highlightText(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length) return text;

  const regex = new RegExp(`(${keywords.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isKeyword = keywords.some(
      (keyword) => keyword.toLowerCase() === part.toLowerCase()
    );
    if (isKeyword) {
      return (
        <mark
          key={index}
          className="bg-primary-100 text-primary-700 px-1 rounded font-medium"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

export default function TranscriptFeed({
  segments,
  isLive = false,
  currentTime = 0,
  highlightKeywords = [],
}: TranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments are added
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments.length, isLive]);

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
        <div className="flex items-center gap-1 text-sm text-surface-500">
          <Clock className="w-4 h-4" />
          <span>{formatTimestamp(currentTime)}</span>
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide"
      >
        {segments.length === 0 ? (
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
        ) : (
          <AnimatePresence mode="popLayout">
            {segments.map((segment, index) => (
              <motion.div
                key={segment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="transcript-line group"
              >
                <div className="flex items-start gap-3">
                  {/* Timestamp */}
                  <span className="flex-shrink-0 text-xs text-surface-400 font-mono mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatTimestamp(segment.timestamp)}
                  </span>

                  {/* Speaker indicator (if available) */}
                  {segment.speaker && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-subtle flex items-center justify-center">
                      <User className="w-3 h-3 text-primary-600" />
                    </div>
                  )}

                  {/* Text content */}
                  <p className="flex-1 text-surface-700 text-sm leading-relaxed">
                    {highlightText(segment.text, highlightKeywords)}
                  </p>
                </div>

                {/* Confidence indicator (subtle) */}
                {segment.confidence && segment.confidence < 0.8 && (
                  <div className="ml-8 mt-1">
                    <span className="text-xs text-surface-400 italic">
                      (low confidence)
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />

        {/* Typing indicator for live mode */}
        {isLive && segments.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-2 text-surface-400"
          >
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs">Listening...</span>
          </motion.div>
        )}
      </div>

      {/* Footer with word count */}
      <div className="px-4 py-2 border-t border-surface-100 bg-surface-50/50">
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
          </span>
          <span>
            {segments.reduce((acc, seg) => acc + seg.text.split(/\s+/).length, 0)} words
          </span>
        </div>
      </div>
    </div>
  );
}

