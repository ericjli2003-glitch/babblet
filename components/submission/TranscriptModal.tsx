'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Download, Search, Flag, MessageSquare, CheckCircle, Play, Pause, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TranscriptEntry {
  timestamp: string;
  timestampMs: number;
  text: string;
  speaker?: string;
  isHighlighted?: boolean;
}

interface FlaggedSegment {
  id: string;
  segmentIndex: number;
  timestamp: string;
  reason?: string;
  createdAt: number;
}

interface Comment {
  id: string;
  segmentIndex: number;
  timestamp: string;
  text: string;
  createdAt: number;
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
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);

  const safeEntries = transcriptEntries || [];

  // Load annotations from API when modal opens
  useEffect(() => {
    if (isOpen && submissionId) {
      setIsLoadingAnnotations(true);
      fetch(`/api/bulk/annotations?submissionId=${submissionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.annotations) {
            setFlaggedSegments(data.annotations.flaggedSegments || []);
            setComments(data.annotations.comments || []);
            setIsGraded(data.annotations.isGraded || false);
          }
        })
        .catch(err => console.error('Failed to load annotations:', err))
        .finally(() => setIsLoadingAnnotations(false));
    }
  }, [isOpen, submissionId]);

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

  // Instructor control handlers - with API persistence
  const handleFlagSegment = useCallback(async () => {
    if (!submissionId) return;
    const currentEntry = safeEntries[currentSegmentIndex];
    if (!currentEntry) return;

    const existingFlag = flaggedSegments.find(f => f.segmentIndex === currentSegmentIndex);
    
    setIsSaving(true);
    try {
      if (existingFlag) {
        // Unflag - delete from API
        const res = await fetch(`/api/bulk/annotations?submissionId=${submissionId}&type=flag&id=${existingFlag.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          setFlaggedSegments(data.annotations.flaggedSegments || []);
        }
      } else {
        // Flag - add to API
        const res = await fetch('/api/bulk/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId,
            type: 'flag',
            segmentIndex: currentSegmentIndex,
            timestamp: currentEntry.timestamp,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setFlaggedSegments(data.annotations.flaggedSegments || []);
          setShowFlagConfirm(true);
          setTimeout(() => setShowFlagConfirm(false), 2000);
        }
      }
    } catch (err) {
      console.error('Failed to update flag:', err);
    } finally {
      setIsSaving(false);
    }
  }, [submissionId, currentSegmentIndex, safeEntries, flaggedSegments]);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !submissionId) return;
    const currentEntry = safeEntries[currentSegmentIndex];
    if (!currentEntry) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/bulk/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          type: 'comment',
          segmentIndex: currentSegmentIndex,
          timestamp: currentEntry.timestamp,
          text: commentText,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(data.annotations.comments || []);
        setCommentText('');
        setShowCommentInput(false);
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsSaving(false);
    }
  }, [commentText, submissionId, currentSegmentIndex, safeEntries]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!submissionId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/bulk/annotations?submissionId=${submissionId}&type=comment&id=${commentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setComments(data.annotations.comments || []);
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    } finally {
      setIsSaving(false);
    }
  }, [submissionId]);

  const handleDeleteFlag = useCallback(async (flagId: string) => {
    if (!submissionId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/bulk/annotations?submissionId=${submissionId}&type=flag&id=${flagId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setFlaggedSegments(data.annotations.flaggedSegments || []);
      }
    } catch (err) {
      console.error('Failed to delete flag:', err);
    } finally {
      setIsSaving(false);
    }
  }, [submissionId]);

  const handleMarkGraded = useCallback(async () => {
    if (!submissionId) {
      setIsGraded(true);
      onMarkGraded?.();
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await fetch('/api/bulk/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, type: 'mark_graded' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsGraded(true);
        onMarkGraded?.();
      }
    } catch (err) {
      console.error('Failed to mark as graded:', err);
    } finally {
      setIsSaving(false);
    }
  }, [submissionId, onMarkGraded]);

  const isCurrentSegmentFlagged = flaggedSegments.some(f => f.segmentIndex === currentSegmentIndex);

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
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
                    Instructor Controls
                  </h4>
                  {isSaving && (
                    <span className="flex items-center gap-1.5 text-xs text-primary-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={handleFlagSegment}
                    disabled={isSaving || !submissionId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
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
                    disabled={!submissionId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
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
                    disabled={isGraded || isSaving || !submissionId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
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
                          onKeyDown={(e) => e.key === 'Enter' && !isSaving && handleAddComment()}
                          disabled={isSaving}
                        />
                        <button
                          onClick={handleAddComment}
                          disabled={isSaving || !commentText.trim()}
                          className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
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
                          const segmentFlag = flaggedSegments.find(f => f.segmentIndex === entry.originalIndex);
                          const segmentComments = comments.filter(c => c.segmentIndex === entry.originalIndex);
                          const isFlagged = !!segmentFlag;
                          const hasComment = segmentComments.length > 0;
                          
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
                              {/* Indicators with delete option */}
                              {(isFlagged || hasComment) && (
                                <div className="absolute top-2 right-2 flex gap-1">
                                  {isFlagged && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteFlag(segmentFlag.id);
                                      }}
                                      className="group flex items-center gap-0.5 hover:bg-amber-100 rounded px-1 transition-colors"
                                      title="Click to remove flag"
                                    >
                                      <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />
                                      <Trash2 className="w-2.5 h-2.5 text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                  )}
                                  {hasComment && (
                                    <span className="flex items-center gap-0.5">
                                      <MessageSquare className="w-3 h-3 text-blue-500 fill-blue-500" />
                                      <span className="text-xs text-blue-600">{segmentComments.length}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                              <p className="text-sm text-surface-700 leading-relaxed pr-12">
                                {highlightText(entry.text, searchQuery)}
                              </p>
                              {entryIndex > 0 && (
                                <span className="text-xs text-surface-400 mt-1 block">
                                  {entry.timestamp}
                                </span>
                              )}
                              {/* Show comments for this segment */}
                              {segmentComments.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {segmentComments.map(comment => (
                                    <div key={comment.id} className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg group">
                                      <MessageSquare className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                      <p className="text-xs text-blue-700 flex-1">{comment.text}</p>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteComment(comment.id);
                                        }}
                                        className="p-1 text-blue-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete comment"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
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
