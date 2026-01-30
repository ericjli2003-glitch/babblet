'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ChevronRight, Play, Pause, Volume2, VolumeX,
  Clock, FileText, Star, TrendingUp, TrendingDown, Minus,
  MessageCircleQuestion, Lightbulb, AlertTriangle
} from 'lucide-react';
import TranscriptViewer, { type TranscriptSegment, type SegmentHighlight } from './TranscriptViewer';

// ============================================
// Types
// ============================================

interface TranscriptRef {
  segmentId: string;
  timestamp: number;
  snippet: string;
}

interface StrengthOrImprovement {
  text: string;
  criterionId?: string;
  criterionName?: string;
  transcriptRefs?: TranscriptRef[];
}

interface CriterionBreakdown {
  criterionId?: string;
  criterion: string;
  score: number;
  feedback: string;
  rationale?: string;
  transcriptRefs?: TranscriptRef[];
  strengths?: StrengthOrImprovement[];
  improvements?: StrengthOrImprovement[];
  citations?: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
  }>;
}

interface RubricDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // What to show
  criterion?: CriterionBreakdown;
  item?: StrengthOrImprovement;
  itemType?: 'strength' | 'improvement';
  // Context
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  videoUrl?: string;
  // Callbacks
  onSeekVideo?: (timestamp: number) => void;
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

function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= score
              ? 'text-amber-400 fill-amber-400'
              : 'text-surface-300'
            }`}
        />
      ))}
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 3) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreTrend(score: number) {
  if (score >= 4) return { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' };
  if (score >= 3) return { icon: Minus, color: 'text-amber-500', bg: 'bg-amber-50' };
  return { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' };
}

// ============================================
// Mini Video Player
// ============================================

function MiniVideoPlayer({ 
  url, 
  currentTime, 
  onTimeUpdate,
  onSeek 
}: { 
  url: string; 
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (videoRef.current && currentTime !== undefined) {
      videoRef.current.currentTime = currentTime / 1000;
    }
  }, [currentTime]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime * 1000;
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
      onTimeUpdate?.(time);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const time = percent * videoRef.current.duration * 1000;
      videoRef.current.currentTime = time / 1000;
      onSeek?.(time);
    }
  };

  return (
    <div className="bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        src={url}
        className="w-full aspect-video"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        muted={isMuted}
      />
      <div className="p-2 bg-surface-900 flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="p-1.5 rounded-lg hover:bg-surface-800 text-white"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-1.5 rounded-lg hover:bg-surface-800 text-white"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <div 
          className="flex-1 h-1.5 bg-surface-700 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div 
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-surface-400 font-mono">
          {formatTimestamp(progress * duration * 10)}
        </span>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function RubricDetailDrawer({
  isOpen,
  onClose,
  criterion,
  item,
  itemType,
  transcript,
  transcriptSegments,
  videoUrl,
  onSeekVideo,
}: RubricDetailDrawerProps) {
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Build highlights from transcript refs
  const highlights: SegmentHighlight[] = [];
  
  // Add criterion-level highlights
  if (criterion?.transcriptRefs) {
    for (const ref of criterion.transcriptRefs) {
      highlights.push({
        segmentId: ref.segmentId,
        type: 'active',
        label: criterion.criterion,
      });
    }
  }
  
  // Add item-level highlights
  if (item?.transcriptRefs) {
    for (const ref of item.transcriptRefs) {
      highlights.push({
        segmentId: ref.segmentId,
        type: itemType === 'strength' ? 'strength' : 'weakness',
        label: item.text.slice(0, 30),
      });
    }
  }

  // Jump to first relevant segment when drawer opens
  useEffect(() => {
    if (isOpen) {
      const firstRef = item?.transcriptRefs?.[0] || criterion?.transcriptRefs?.[0];
      if (firstRef) {
        setActiveSegmentId(firstRef.segmentId);
        setCurrentVideoTime(firstRef.timestamp);
        onSeekVideo?.(firstRef.timestamp);
      }
    }
  }, [isOpen, criterion, item, onSeekVideo]);

  const handleSegmentClick = (segment: TranscriptSegment) => {
    setActiveSegmentId(segment.id);
    setCurrentVideoTime(segment.timestamp);
    onSeekVideo?.(segment.timestamp);
  };

  const handleTranscriptRefClick = (ref: TranscriptRef) => {
    setActiveSegmentId(ref.segmentId);
    setCurrentVideoTime(ref.timestamp);
    onSeekVideo?.(ref.timestamp);
  };

  const trend = criterion ? getScoreTrend(criterion.score) : null;
  const TrendIcon = trend?.icon || Minus;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200">
              <div className="flex items-center gap-3">
                {itemType === 'strength' ? (
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-emerald-600" />
                  </div>
                ) : itemType === 'improvement' ? (
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                ) : (
                  <div className={`w-10 h-10 rounded-xl ${trend?.bg || 'bg-surface-100'} flex items-center justify-center`}>
                    <TrendIcon className={`w-5 h-5 ${trend?.color || 'text-surface-600'}`} />
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-surface-900">
                    {item ? (itemType === 'strength' ? 'Strength' : 'Area for Improvement') : criterion?.criterion}
                  </h2>
                  {criterion && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <ScoreStars score={criterion.score} />
                      <span className={`text-lg font-bold ${getScoreColor(criterion.score)}`}>
                        {criterion.score}/5
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-100 text-surface-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Main content section */}
              <div className="p-4 space-y-6">
                {/* Item description */}
                {item && (
                  <div className={`p-4 rounded-xl ${itemType === 'strength' ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <p className="text-surface-800">{item.text}</p>
                    {item.criterionName && (
                      <p className="text-sm text-surface-500 mt-2 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        From: {item.criterionName}
                      </p>
                    )}
                  </div>
                )}

                {/* Criterion feedback */}
                {criterion && !item && (
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-50 rounded-xl">
                      <h3 className="text-sm font-medium text-surface-500 mb-2">Feedback</h3>
                      <p className="text-surface-800">{criterion.feedback}</p>
                    </div>
                    {criterion.rationale && (
                      <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
                        <h3 className="text-sm font-medium text-violet-700 mb-2">Why this score</h3>
                        <p className="text-surface-800">{criterion.rationale}</p>
                      </div>
                    )}

                    {/* Strengths for this criterion */}
                    {criterion.strengths && criterion.strengths.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-600 mb-2 flex items-center gap-1">
                          <Lightbulb className="w-4 h-4" />
                          Strengths
                        </h3>
                        <div className="space-y-2">
                          {criterion.strengths.map((s, i) => (
                            <div key={i} className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                              <p className="text-sm text-surface-800">
                                {typeof s === 'string' ? s : s.text}
                              </p>
                              {typeof s !== 'string' && s.transcriptRefs?.map((ref, j) => (
                                <button
                                  key={j}
                                  onClick={() => handleTranscriptRefClick(ref)}
                                  className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                >
                                  <Clock className="w-3 h-3" />
                                  {formatTimestamp(ref.timestamp)} - "{ref.snippet.slice(0, 40)}..."
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Improvements for this criterion */}
                    {criterion.improvements && criterion.improvements.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-amber-600 mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          Areas for Improvement
                        </h3>
                        <div className="space-y-2">
                          {criterion.improvements.map((s, i) => (
                            <div key={i} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <p className="text-sm text-surface-800">
                                {typeof s === 'string' ? s : s.text}
                              </p>
                              {typeof s !== 'string' && s.transcriptRefs?.map((ref, j) => (
                                <button
                                  key={j}
                                  onClick={() => handleTranscriptRefClick(ref)}
                                  className="mt-2 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                                >
                                  <Clock className="w-3 h-3" />
                                  {formatTimestamp(ref.timestamp)} - "{ref.snippet.slice(0, 40)}..."
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Document citations */}
                    {criterion.citations && criterion.citations.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-violet-600 mb-2 flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          Course Materials Referenced
                        </h3>
                        <div className="space-y-2">
                          {criterion.citations.map((c, i) => (
                            <div key={i} className="p-3 bg-violet-50 rounded-lg border border-violet-200">
                              <p className="text-xs font-medium text-violet-700 mb-1">{c.documentName}</p>
                              <p className="text-sm text-surface-600 italic">"{c.snippet}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Transcript reference snippets */}
                {(item?.transcriptRefs?.length || criterion?.transcriptRefs?.length) && (
                  <div>
                    <h3 className="text-sm font-medium text-surface-500 mb-2 flex items-center gap-1">
                      <MessageCircleQuestion className="w-4 h-4" />
                      Relevant Transcript Moments
                    </h3>
                    <div className="space-y-2">
                      {[...(item?.transcriptRefs || []), ...(criterion?.transcriptRefs || [])].map((ref, i) => (
                        <button
                          key={i}
                          onClick={() => handleTranscriptRefClick(ref)}
                          className="w-full p-3 bg-surface-50 rounded-lg border border-surface-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Play className="w-3 h-3 text-primary-500 group-hover:text-primary-600" />
                            <span className="text-xs font-mono text-primary-600">
                              {formatTimestamp(ref.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-surface-700">"{ref.snippet}"</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mini video player + transcript section */}
              {(videoUrl || transcriptSegments?.length) && (
                <div className="border-t border-surface-200">
                  {/* Video player */}
                  {videoUrl && (
                    <div className="p-4">
                      <MiniVideoPlayer
                        url={videoUrl}
                        currentTime={currentVideoTime}
                        onTimeUpdate={setCurrentVideoTime}
                        onSeek={(time) => {
                          setCurrentVideoTime(time);
                          onSeekVideo?.(time);
                        }}
                      />
                    </div>
                  )}

                  {/* Transcript viewer */}
                  {transcriptSegments && transcriptSegments.length > 0 && (
                    <div className="px-4 pb-4">
                      <h3 className="text-sm font-medium text-surface-500 mb-2">Transcript</h3>
                      <TranscriptViewer
                        segments={transcriptSegments}
                        highlights={highlights}
                        activeSegmentId={activeSegmentId}
                        currentTime={currentVideoTime}
                        onSegmentClick={handleSegmentClick}
                        autoScroll
                        compact
                        className="max-h-64 border border-surface-200 rounded-xl p-2"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

