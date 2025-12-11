'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TranscriptSegment, SemanticEvent } from '@/lib/types';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  semanticEvents: SemanticEvent[];
  isListening: boolean;
}

const eventBadgeColors: Record<string, string> = {
  claim: 'bg-primary-100 text-primary-700 border-primary-200',
  topic_shift: 'bg-accent-100 text-accent-700 border-accent-200',
  definition: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  example: 'bg-amber-100 text-amber-700 border-amber-200',
  argument: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  evidence: 'bg-teal-100 text-teal-700 border-teal-200',
  conclusion: 'bg-rose-100 text-rose-700 border-rose-200',
  question: 'bg-orange-100 text-orange-700 border-orange-200',
  unclear: 'bg-surface-100 text-surface-600 border-surface-200',
};

export default function TranscriptPanel({ 
  segments, 
  semanticEvents,
  isListening,
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments, semanticEvents]);

  const getEventsForSegment = (segment: TranscriptSegment) => {
    return semanticEvents.filter(e => 
      Math.abs(e.timestamp - segment.timestamp) < 2000
    );
  };

  return (
    <div className="card-neumorphic overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between bg-white">
        <h3 className="font-semibold text-surface-900">Live Transcript</h3>
        {isListening && (
          <div className="flex items-center gap-2">
            <span className="pulse-dot" />
            <span className="text-sm text-rose-500 font-medium">Recording</span>
          </div>
        )}
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
      >
        {segments.length === 0 ? (
          <div className="text-center text-surface-400 py-8">
            <p className="text-lg">No transcript yet</p>
            <p className="text-sm mt-1">Start listening to see the live transcript</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {segments.map((segment, idx) => {
              const events = getEventsForSegment(segment);
              
              return (
                <motion.div
                  key={segment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="transcript-line group"
                >
                  <p className="text-surface-700 leading-relaxed">
                    {segment.text}
                    {idx === segments.length - 1 && isListening && (
                      <span className="inline-flex ml-1">
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="text-primary-500"
                        >
                          |
                        </motion.span>
                      </span>
                    )}
                  </p>
                  
                  {events.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {events.map(event => (
                        <span
                          key={event.id}
                          className={`px-2 py-0.5 text-xs rounded-full border ${eventBadgeColors[event.type] || eventBadgeColors.unclear}`}
                        >
                          {event.type}: {event.content.slice(0, 50)}...
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
