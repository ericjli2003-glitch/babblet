'use client';

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Mic } from 'lucide-react';
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

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  currentTime?: number;
  highlightKeywords?: string[];
  questionHighlights?: string[]; // Phrases from questions to highlight in yellow
  interimText?: string; // Real-time interim transcription
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Escape regex special characters
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filter and clean keywords
function cleanKeywords(keywords: string[]): string[] {
  return Array.from(new Set(
    keywords
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length >= 4) // Min 4 characters
      .filter(k => !STOPWORDS.has(k)) // Exclude stopwords
      .filter(k => /^[a-z]/i.test(k)) // Must start with letter
  ));
}

function highlightText(
  text: string, 
  keywords: string[], 
  questionPhrases: string[] = []
): React.ReactNode {
  // Clean and filter keywords
  const cleanedKeywords = cleanKeywords(keywords);
  
  // Build combined pattern with word boundaries
  const patterns: { pattern: RegExp; type: 'keyword' | 'question' }[] = [];
  
  // Add question phrases first (higher priority, yellow highlight)
  questionPhrases.forEach(phrase => {
    const cleaned = phrase.trim();
    if (cleaned.length >= 3) {
      try {
        patterns.push({
          pattern: new RegExp(`\\b${escapeRegex(cleaned)}\\b`, 'gi'),
          type: 'question'
        });
      } catch (e) {
        // Invalid regex, skip
      }
    }
  });
  
  // Add keywords (blue highlight)
  if (cleanedKeywords.length > 0) {
    // Sort by length (longest first) to avoid partial matches
    const sorted = cleanedKeywords.sort((a, b) => b.length - a.length);
    const escapedKeywords = sorted.map(escapeRegex);
    patterns.push({
      pattern: new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi'),
      type: 'keyword'
    });
  }
  
  if (patterns.length === 0) return text;
  
  // Apply highlights
  let result: React.ReactNode[] = [text];
  let keyIndex = 0;
  
  patterns.forEach(({ pattern, type }) => {
    const newResult: React.ReactNode[] = [];
    
    result.forEach(part => {
      if (typeof part !== 'string') {
        newResult.push(part);
        return;
      }
      
      const splitParts = part.split(pattern);
      const matches = part.match(pattern) || [];
      
      splitParts.forEach((subPart, i) => {
        if (subPart) newResult.push(subPart);
        if (i < matches.length) {
          const className = type === 'question' 
            ? 'bg-yellow-200 text-yellow-900 px-1 rounded font-medium'
            : 'bg-primary-100 text-primary-700 px-1 rounded font-medium';
          newResult.push(
            <mark key={`${type}-${keyIndex++}`} className={className}>
              {matches[i]}
            </mark>
          );
        }
      });
    });
    
    result = newResult;
  });
  
  return result;
}

export default function TranscriptFeed({
  segments,
  isLive = false,
  currentTime = 0,
  highlightKeywords = [],
  questionHighlights = [],
  interimText = '',
}: TranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Debug: Log when component renders
  console.log('[TranscriptFeed] Rendering with', segments.length, 'segments');

  // Combine all segments into a single paragraph
  const fullTranscript = segments.map(s => s.text).join(' ').trim();
  const wordCount = fullTranscript ? fullTranscript.split(/\s+/).length : 0;

  console.log('[TranscriptFeed] Full transcript length:', fullTranscript.length, 'chars,', wordCount, 'words');

  // Display text includes interim (real-time) transcription
  const hasInterim = interimText.trim().length > 0;

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [fullTranscript, isLive]);

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

      {/* Transcript Content - Single Paragraph */}
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
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-sm max-w-none"
          >
            <p className="text-surface-700 text-base leading-relaxed whitespace-pre-wrap">
              {highlightText(fullTranscript, highlightKeywords, questionHighlights)}
              {/* Show interim (real-time) text in a different style */}
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

      {/* Footer with word count */}
      <div className="px-4 py-2 border-t border-surface-100 bg-surface-50/50">
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
          </span>
          <span>
            {wordCount} word{wordCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
