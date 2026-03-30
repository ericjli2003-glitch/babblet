'use client';

import { useMemo, useRef, useEffect } from 'react';

export interface FeedbackTimelineItem {
  id: string;
  timestampMs: number;
  timestampLabel: string;
  type: 'strength' | 'improvement';
  criterion?: string;
  text: string;
  snippet?: string;
}

interface FeedbackTimelineProps {
  items: FeedbackTimelineItem[];
  currentTimeMs?: number;
  onSeek?: (ms: number) => void;
}

export default function FeedbackTimeline({ items, currentTimeMs = 0, onSeek }: FeedbackTimelineProps) {
  const activeItemRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...items].filter(i => i.timestampMs >= 0).sort((a, b) => a.timestampMs - b.timestampMs),
    [items]
  );

  // Active = last item whose timestamp falls within current playback position (5s lookahead)
  const activeIdx = useMemo(() => {
    if (currentTimeMs <= 0) return -1;
    let result = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].timestampMs <= currentTimeMs + 5000) result = i;
    }
    return result;
  }, [sorted, currentTimeMs]);

  // Auto-scroll to active item while video plays
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIdx]);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <h3 className="text-sm font-semibold text-surface-900">Feedback Timeline</h3>
        {onSeek && (
          <p className="text-xs text-surface-400">— click any moment to jump to it in the video</p>
        )}
        <span className="ml-auto text-xs text-surface-400 flex-shrink-0">{sorted.length} moments</span>
      </div>

      {/* Timeline list */}
      <div className="relative px-5 py-4 max-h-[440px] overflow-y-auto">
        {/* Vertical connector */}
        <div className="absolute left-[28px] top-4 bottom-4 w-px bg-surface-100" aria-hidden />

        <div className="space-y-3">
          {sorted.map((item, i) => {
            const isActive = i === activeIdx;
            const isS = item.type === 'strength';

            return (
              <div
                key={`${item.id}-${i}`}
                ref={isActive ? activeItemRef : undefined}
                role={onSeek ? 'button' : undefined}
                tabIndex={onSeek ? 0 : undefined}
                className={`relative flex gap-3 pl-8 group outline-none ${onSeek ? 'cursor-pointer' : ''}`}
                onClick={() => onSeek?.(item.timestampMs)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSeek?.(item.timestampMs);
                  }
                }}
              >
                {/* Dot on timeline */}
                <div
                  className={`absolute left-0 top-2 w-5 h-5 rounded-full flex items-center justify-center z-10 transition-all duration-200 ${
                    isActive
                      ? `scale-125 ring-4 ${isS ? 'ring-emerald-100' : 'ring-amber-100'}`
                      : onSeek ? 'group-hover:scale-110' : ''
                  } ${isS ? 'bg-emerald-500' : 'bg-amber-500'}`}
                >
                  {isS ? (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 6l2.5-2.5 2 2 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M5 2.5v3.5M5 7.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Card */}
                <div
                  className={`flex-1 rounded-xl p-3 border transition-all duration-200 ${
                    isActive
                      ? isS
                        ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                        : 'bg-amber-50 border-amber-200 shadow-sm'
                      : onSeek
                        ? 'bg-surface-50 border-surface-100 hover:bg-surface-100 hover:border-surface-200 group-focus:bg-surface-100'
                        : 'bg-surface-50 border-surface-100'
                  }`}
                >
                  {/* Row: timestamp + type + criterion */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isS ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.timestampLabel}
                    </span>
                    <span className={`text-[10px] font-semibold ${isS ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isS ? 'Strength' : 'Improvement'}
                    </span>
                    {item.criterion && (
                      <span
                        className="ml-auto text-[10px] text-surface-400 truncate max-w-[160px]"
                        title={item.criterion}
                      >
                        {item.criterion}
                      </span>
                    )}
                  </div>

                  {/* Feedback text */}
                  <p className="text-xs text-surface-700 leading-relaxed">{item.text}</p>

                  {/* Transcript snippet */}
                  {item.snippet && (
                    <p className="mt-2 text-[10px] italic text-surface-500 border-l-2 border-surface-200 pl-2 leading-relaxed line-clamp-2">
                      &ldquo;{item.snippet}&rdquo;
                    </p>
                  )}

                  {/* Play hint — appears on hover */}
                  {onSeek && (
                    <p
                      className={`mt-1.5 text-[9px] font-semibold opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity ${
                        isS ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    >
                      ▶ Jump to this moment
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
