'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Download, Search, Flag, MessageSquare, CheckCircle, Play, Pause, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TranscriptEntry {
  timestamp: string;
  timestampMs: number;
  text: string;
  speaker?: string;
  isHighlighted?: boolean;
}

interface FlaggedSegment {
  index: number;
  timestamp: string;
  reason?: string;
}

interface Comment {
  index: number;
  timestamp: string;
  text: string;
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
  submissionId?: string;
  onMarkGraded?: () => void;
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

// Highlight search matches in text
const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) => 
    regex.test(part) ? <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark> : part
  );
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
  submissionId,
  onMarkGraded,
}: TranscriptModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [modalVideoTime, setModalVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // Instructor controls state
  const [flaggedSegments, setFlaggedSegments] = useState<FlaggedSegment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isGraded, setIsGraded] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showFlagConfirm, setShowFlagConfirm] = useState(false);

  const safeEntries = transcriptEntries || [];

  // Find current segment based on modal video time
  const currentSegmentIndex = useMemo(() => {
    if (safeEntries.length === 0 || modalVideoTime === 0) return 0;
    
    // Find the segment that matches the current time
    for (let i = safeEntries.length - 1; i >= 0; i--) {
      if (safeEntries[i].timestampMs <= modalVideoTime) {
        return i;
      }
    }
    return 0;
  }, [safeEntries, modalVideoTime]);

  // Filter entries by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return safeEntries;
    const query = searchQuery.toLowerCase();
    return safeEntries.filter(e => 
      e.text.toLowerCase().includes(query) ||
      e.speaker?.toLowerCase().includes(query)
    );
  }, [safeEntries, searchQuery]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (autoScroll && transcriptRef.current && !searchQuery) {
      const currentEl = transcriptRef.current.querySelector(`[data-segment-index="${currentSegmentIndex}"]`);
      if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSegmentIndex, autoScroll, searchQuery]);

  // Video time update handler
  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setModalVideoTime(videoRef.current.currentTime * 1000);
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration * 1000);
    }
  }, []);

  const handleSeek = useCallback((timestampMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampMs / 1000;
      videoRef.current.play();
    }
    onSeek?.(timestampMs);
  }, [onSeek]);

  // Instructor control handlers
  const handleFlagSegment = useCallback(() => {
    const currentEntry = safeEntries[currentSegmentIndex];
    if (currentEntry) {
      const existingIndex = flaggedSegments.findIndex(f => f.index === currentSegmentIndex);
      if (existingIndex >= 0) {
        // Unflag
        setFlaggedSegments(prev => prev.filter((_, i) => i !== existingIndex));
      } else {
        // Flag
        setFlaggedSegments(prev => [...prev, {
          index: currentSegmentIndex,
          timestamp: currentEntry.timestamp,
        }]);
        setShowFlagConfirm(true);
        setTimeout(() => setShowFlagConfirm(false), 2000);
      }
    }
  }, [currentSegmentIndex, safeEntries, flaggedSegments]);

  const handleAddComment = useCallback(() => {
    if (!commentText.trim()) return;
    const currentEntry = safeEntries[currentSegmentIndex];
    if (currentEntry) {
      setComments(prev => [...prev, {
        index: currentSegmentIndex,
        timestamp: currentEntry.timestamp,
        text: commentText,
      }]);
      setCommentText('');
      setShowCommentInput(false);
    }
  }, [commentText, currentSegmentIndex, safeEntries]);

  const handleMarkGraded = useCallback(() => {
    setIsGraded(true);
    onMarkGraded?.();
  }, [onMarkGraded]);

  const isCurrentSegmentFlagged = flaggedSegments.some(f => f.index === currentSegmentIndex);

  // Early return if not open
  if (!isOpen) return null;

  // Group entries by speaker for visual grouping
  const groupedEntries = filteredEntries.reduce((groups, entry, index) => {
    const originalIndex = safeEntries.findIndex(e => e === entry);
    const prevEntry = filteredEntries[index - 1];
    const isSameSpeaker = prevEntry?.speaker === entry.speaker;
    
    if (!isSameSpeaker) {
      groups.push({ speaker: entry.speaker || 'Speaker', entries: [{ ...entry, originalIndex }] });
    } else if (groups.length > 0) {
      groups[groups.length - 1].entries.push({ ...entry, originalIndex });
    }
    return groups;
  }, [] as { speaker: string; entries: (TranscriptEntry & { originalIndex: number })[] }[]);

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
              <div className="flex items-center gap-3 mt-1">
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Processing Status: {status}
                </span>
                {isGraded && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Graded
                  </span>
                )}
                {flaggedSegments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    <Flag className="w-3 h-3" />
                    {flaggedSegments.length} flagged
                  </span>
                )}
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
                    onTimeUpdate={handleVideoTimeUpdate}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-700 to-surface-900">
                    <div className="text-center text-surface-400">
                      <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No video available</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Current Segment Info */}
              {safeEntries[currentSegmentIndex] && (
                <div className="mt-4 p-3 bg-surface-50 rounded-lg border border-surface-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-surface-500">Current Segment</span>
                    <span className="text-xs text-primary-600 font-mono">
                      {safeEntries[currentSegmentIndex].timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-surface-700 line-clamp-2">
                    {safeEntries[currentSegmentIndex].text}
                  </p>
                </div>
              )}

              {/* Instructor Controls */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  Instructor Controls
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={handleFlagSegment}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isCurrentSegmentFlagged
                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                        : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                    }`}
                  >
                    <Flag className={`w-4 h-4 ${isCurrentSegmentFlagged ? 'text-amber-500 fill-amber-500' : 'text-amber-500'}`} />
                    {isCurrentSegmentFlagged ? 'Unflag' : 'Flag Segment'}
                  </button>
                  <button 
                    onClick={() => setShowCommentInput(!showCommentInput)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      showCommentInput
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    Add Comment
                  </button>
                  <button 
                    onClick={handleMarkGraded}
                    disabled={isGraded}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isGraded
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                        : 'bg-surface-100 hover:bg-surface-200 text-surface-700'
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 ${isGraded ? 'text-emerald-500 fill-emerald-500' : 'text-emerald-500'}`} />
                    {isGraded ? 'Graded' : 'Mark as Graded'}
                  </button>
                </div>

                {/* Comment Input */}
                <AnimatePresence>
                  {showCommentInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Add a comment for this segment..."
                          className="flex-1 px-3 py-2 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                        />
                        <button
                          onClick={handleAddComment}
                          className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Flag Confirmation */}
                <AnimatePresence>
                  {showFlagConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-700"
                    >
                      <AlertCircle className="w-4 h-4" />
                      Segment flagged for review
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Comments List */}
                {comments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="text-xs font-medium text-surface-500">Comments ({comments.length})</h5>
                    {comments.map((comment, i) => (
                      <div key={i} className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                        <span className="text-xs text-blue-500 font-mono">{comment.timestamp}</span>
                        <p className="text-surface-700 mt-0.5">{comment.text}</p>
                      </div>
                    ))}
                  </div>
                )}
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
                    className="w-full pl-10 pr-16 py-2.5 border border-surface-200 rounded-lg text-sm text-surface-900 bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  {searchQuery && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">
                      {filteredEntries.length} matches
                    </span>
                  )}
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
                  <span className="text-xs text-surface-400">
                    Segment {currentSegmentIndex + 1} of {safeEntries.length}
                  </span>
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
                          const isCurrent = entry.originalIndex === currentSegmentIndex;
                          const isFlagged = flaggedSegments.some(f => f.index === entry.originalIndex);
                          const hasComment = comments.some(c => c.index === entry.originalIndex);
                          
                          return (
                            <div
                              key={entryIndex}
                              data-segment-index={entry.originalIndex}
                              onClick={() => handleSeek(entry.timestampMs)}
                              className={`cursor-pointer p-3 rounded-xl transition-colors relative ${
                                isCurrent
                                  ? `${colors.bg} ${colors.border} border-2`
                                  : 'bg-surface-50 hover:bg-surface-100'
                              }`}
                            >
                              {/* Indicators */}
                              {(isFlagged || hasComment) && (
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {isFlagged && <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />}
                                  {hasComment && <MessageSquare className="w-3 h-3 text-blue-500 fill-blue-500" />}
                                </div>
                              )}
                              <p className="text-sm text-surface-700 leading-relaxed pr-8">
                                {highlightText(entry.text, searchQuery)}
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
                <button 
                  onClick={() => setShowCommentInput(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-surface-600 hover:text-surface-900 hover:bg-surface-100 border border-dashed border-surface-300 rounded-lg transition-colors"
                >
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
