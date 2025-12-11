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
  claim: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  topic_shift: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  definition: 'bg-green-500/20 text-green-300 border-green-500/40',
  example: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  argument: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  evidence: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  conclusion: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  question: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  unclear: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
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
    <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold text-white">Live Transcript</h3>
        {isListening && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-sm text-red-400 font-medium">Recording</span>
          </div>
        )}
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {segments.length === 0 ? (
          <div className="text-center text-white/40 py-8">
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
                  className="group"
                >
                  <p className="text-white/90 leading-relaxed">
                    {segment.text}
                    {idx === segments.length - 1 && isListening && (
                      <span className="inline-flex ml-1">
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="text-purple-400"
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

