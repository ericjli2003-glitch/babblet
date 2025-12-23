'use client';

import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, User, MessageCircleQuestion, AlertTriangle, Lightbulb } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  speaker?: string;
}

export interface SegmentHighlight {
  segmentId: string;
  type: 'strength' | 'weakness' | 'question' | 'issue' | 'insight' | 'active';
  label?: string;
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  highlights?: SegmentHighlight[];
  activeSegmentId?: string | null;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  currentTime?: number; // For video sync (ms)
  autoScroll?: boolean;
  compact?: boolean;
  className?: string;
}

// ============================================
// Helpers
// ============================================

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

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

const HIGHLIGHT_STYLES: Record<SegmentHighlight['type'], { bg: string; border: string; icon: typeof Lightbulb }> = {
  strength: { bg: 'bg-emerald-50', border: 'border-emerald-300', icon: Lightbulb },
  weakness: { bg: 'bg-amber-50', border: 'border-amber-300', icon: AlertTriangle },
  question: { bg: 'bg-violet-50', border: 'border-violet-300', icon: MessageCircleQuestion },
  issue: { bg: 'bg-red-50', border: 'border-red-300', icon: AlertTriangle },
  insight: { bg: 'bg-blue-50', border: 'border-blue-300', icon: Lightbulb },
  active: { bg: 'bg-primary-100', border: 'border-primary-400', icon: Clock },
};

// ============================================
// Component
// ============================================

export default function TranscriptViewer({
  segments,
  highlights = [],
  activeSegmentId,
  onSegmentClick,
  currentTime,
  autoScroll = false,
  compact = false,
  className = '',
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Build highlight map for quick lookup
  const highlightMap = useMemo(() => {
    const map = new Map<string, SegmentHighlight[]>();
    for (const h of highlights) {
      const existing = map.get(h.segmentId) || [];
      existing.push(h);
      map.set(h.segmentId, existing);
    }
    return map;
  }, [highlights]);

  // Find current segment based on video time
  const currentSegment = useMemo(() => {
    if (currentTime === undefined) return null;
    // Find segment that contains the current time
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].timestamp <= currentTime) {
        return segments[i];
      }
    }
    return segments[0] || null;
  }, [segments, currentTime]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (autoScroll && activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentId, currentSegment?.id, autoScroll]);

  if (segments.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-surface-400 ${className}`}>
        No transcript available
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-2 overflow-y-auto ${className}`}>
      {segments.map((segment, index) => {
        const isActive = segment.id === activeSegmentId || segment.id === currentSegment?.id;
        const segmentHighlights = highlightMap.get(segment.id) || [];
        const hasHighlight = segmentHighlights.length > 0;
        const speakerColor = getSpeakerColor(segment.speaker);
        
        // Get primary highlight style
        const primaryHighlight = segmentHighlights[0];
        const highlightStyle = primaryHighlight ? HIGHLIGHT_STYLES[primaryHighlight.type] : null;

        return (
          <motion.div
            key={segment.id}
            ref={isActive ? activeRef : undefined}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            onClick={() => onSegmentClick?.(segment)}
            className={`
              relative group rounded-lg transition-all cursor-pointer
              ${compact ? 'p-2' : 'p-3'}
              ${isActive 
                ? 'bg-primary-100 border-2 border-primary-400 shadow-sm' 
                : hasHighlight && highlightStyle
                  ? `${highlightStyle.bg} border-l-4 ${highlightStyle.border}`
                  : 'hover:bg-surface-50 border border-transparent hover:border-surface-200'
              }
            `}
          >
            {/* Timestamp and speaker */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-surface-400 font-mono flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimestamp(segment.timestamp)}
              </span>
              {segment.speaker && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${speakerColor.bg} ${speakerColor.text}`}>
                  <User className="w-3 h-3 inline mr-0.5" />
                  {segment.speaker}
                </span>
              )}
              {/* Highlight indicators */}
              {segmentHighlights.map((h, i) => {
                const style = HIGHLIGHT_STYLES[h.type];
                const Icon = style.icon;
                return (
                  <span 
                    key={i}
                    className={`text-xs px-1.5 py-0.5 rounded ${style.bg} ${style.border} flex items-center gap-0.5`}
                    title={h.label}
                  >
                    <Icon className="w-3 h-3" />
                    {h.label && <span className="max-w-[80px] truncate">{h.label}</span>}
                  </span>
                );
              })}
            </div>
            
            {/* Text content */}
            <p className={`text-surface-800 leading-relaxed ${compact ? 'text-sm' : ''}`}>
              {segment.text}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

