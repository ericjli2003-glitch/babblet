'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Download, Search, Flag, MessageSquare, CheckCircle, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TranscriptEntry {
  timestamp: string;
  timestampMs: number;
  text: string;
  speaker?: string;
  isHighlighted?: boolean;
}

interface TranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  status?: string;
  videoUrl?: string | null;
  transcriptEntries: TranscriptEntry[];
  onSeek?: (timestampMs: number) => void;
  currentTimeMs?: number;
}

// Generate consistent color for speaker
const getSpeakerColor = (speaker: string) => {
  const colors = [
    { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  ];
  const index = speaker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

const getSpeakerInitials = (speaker: string) => {
  return speaker.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
};

export default function TranscriptModal({
  isOpen,
  onClose,
  title,
  status = 'Ready for Review',
  videoUrl,
  transcriptEntries,
  onSeek,
  currentTimeMs = 0,
}: TranscriptModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Filter entries by search
  const safeEntries = transcriptEntries || [];
  const filteredEntries = searchQuery
    ? safeEntries.filter(e => 
        e.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.speaker?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : safeEntries;

  // Auto-scroll to current segment
  useEffect(() => {
    if (autoScroll && transcriptRef.current) {
      const highlighted = transcriptRef.current.querySelector('[data-current="true"]');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTimeMs, autoScroll]);

  const handleSeek = (timestampMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampMs / 1000;
      videoRef.current.play();
      setIsPlaying(true);
    }
    onSeek?.(timestampMs);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Group entries by speaker for visual grouping
  const groupedEntries = filteredEntries.reduce((groups, entry, index) => {
    const prevEntry = filteredEntries[index - 1];
    const isSameSpeaker = prevEntry?.speaker === entry.speaker;
    
    if (!isSameSpeaker) {
      groups.push({ speaker: entry.speaker || 'Speaker', entries: [entry] });
    } else {
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [] as { speaker: string; entries: TranscriptEntry[] }[]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
            <div>
              <h2 className="text-lg font-semibold text-surface-900">Live Transcript - {title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Processing Status: {status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={onClose}
                className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left - Video */}
            <div className="w-1/2 p-6 flex flex-col border-r border-surface-200">
              <div className="relative rounded-xl overflow-hidden bg-surface-900 aspect-video">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-cover"
                    controls
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-700 to-surface-900">
                    <button
                      onClick={togglePlay}
                      className="w-16 h-16 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-white" />
                      ) : (
                        <Play className="w-8 h-8 text-white ml-1" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Instructor Controls */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  Instructor Controls
                </h4>
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors">
                    <Flag className="w-4 h-4 text-amber-500" />
                    Flag Segment
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    Add Comment
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-sm font-medium transition-colors">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Mark as Graded
                  </button>
                </div>
              </div>
            </div>

            {/* Right - Transcript */}
            <div className="w-1/2 flex flex-col">
              {/* Search & Controls */}
              <div className="p-4 border-b border-surface-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search transcript keywords..."
                    className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-surface-600 cursor-pointer">
                    <span className="text-surface-400">↕</span>
                    Auto-scroll
                    <button
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        autoScroll ? 'bg-primary-500' : 'bg-surface-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          autoScroll ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>

              {/* Transcript Entries */}
              <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {groupedEntries.map((group, groupIndex) => {
                  const colors = getSpeakerColor(group.speaker);
                  const initials = getSpeakerInitials(group.speaker);
                  
                  return (
                    <div key={groupIndex} className="flex gap-3">
                      {/* Speaker Avatar */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-semibold`}>
                        {initials}
                      </div>

                      {/* Messages */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-surface-900">{group.speaker}</span>
                          <span className="text-xs text-surface-400">{group.entries[0].timestamp}</span>
                        </div>
                        {group.entries.map((entry, entryIndex) => {
                          const isCurrent = entry.isHighlighted;
                          return (
                            <div
                              key={entryIndex}
                              data-current={isCurrent}
                              onClick={() => handleSeek(entry.timestampMs)}
                              className={`cursor-pointer p-3 rounded-xl transition-colors ${
                                isCurrent
                                  ? `${colors.bg} ${colors.border} border`
                                  : 'bg-surface-50 hover:bg-surface-100'
                              }`}
                            >
                              <p className="text-sm text-surface-700 leading-relaxed">
                                {entry.text}
                              </p>
                              {entryIndex > 0 && (
                                <span className="text-xs text-surface-400 mt-1 block">
                                  {entry.timestamp}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {filteredEntries.length === 0 && (
                  <div className="text-center py-12 text-surface-500">
                    {searchQuery ? 'No matching transcript segments' : 'No transcript available'}
                  </div>
                )}
              </div>

              {/* Add Manual Note */}
              <div className="p-4 border-t border-surface-200">
                <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-surface-600 hover:text-surface-900 hover:bg-surface-100 border border-dashed border-surface-300 rounded-lg transition-colors">
                  <span className="text-lg">+</span>
                  Insert Manual Note
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
