'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ThumbsUp, AlertCircle, MessageSquare, BookOpen, Play, Pause } from 'lucide-react';
import type { VideoBookmark, BookmarkType } from './buildVideoBookmarks';

// ─── Clustering ─────────────────────────────────────────────────────────────

interface BookmarkCluster {
  id: string;
  position: number; // average timestampMs
  bookmarks: VideoBookmark[];
  dominantType: BookmarkType;
}

function clusterBookmarks(bookmarks: VideoBookmark[], windowMs = 1500): BookmarkCluster[] {
  const sorted = [...bookmarks].sort((a, b) => a.timestampMs - b.timestampMs);
  const clusters: BookmarkCluster[] = [];

  for (const bm of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && bm.timestampMs - last.bookmarks[last.bookmarks.length - 1].timestampMs <= windowMs) {
      last.bookmarks.push(bm);
      last.position = last.bookmarks.reduce((s, b) => s + b.timestampMs, 0) / last.bookmarks.length;
    } else {
      clusters.push({
        id: `cluster-${bm.id}`,
        position: bm.timestampMs,
        bookmarks: [bm],
        dominantType: bm.type,
      });
    }
  }

  // Determine dominant type per cluster
  clusters.forEach((c) => {
    const counts: Record<BookmarkType, number> = { strength: 0, improvement: 0, question: 0, rubric: 0 };
    c.bookmarks.forEach((b) => counts[b.type]++);
    c.dominantType = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as BookmarkType;
  });

  return clusters;
}

// ─── Color helpers ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<BookmarkType, { dot: string; ring: string; bg: string; text: string; border: string }> = {
  strength:    { dot: 'bg-emerald-500', ring: 'ring-emerald-200', bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
  improvement: { dot: 'bg-amber-500',   ring: 'ring-amber-200',   bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200' },
  question:    { dot: 'bg-blue-500',     ring: 'ring-blue-200',    bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200' },
  rubric:      { dot: 'bg-primary-500',  ring: 'ring-primary-200', bg: 'bg-primary-50',  text: 'text-primary-700', border: 'border-primary-200' },
};

const TYPE_ICONS: Record<BookmarkType, typeof ThumbsUp> = {
  strength: ThumbsUp,
  improvement: AlertCircle,
  question: MessageSquare,
  rubric: BookOpen,
};

const TYPE_LABELS: Record<BookmarkType, string> = {
  strength: 'Strength',
  improvement: 'Improvement',
  question: 'Question',
  rubric: 'Rubric',
};

// ─── VideoBookmarkBar (exported) ────────────────────────────────────────────

interface VideoBookmarkBarProps {
  bookmarks: VideoBookmark[];
  currentTimeMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  compact?: boolean;
}

export function VideoBookmarkBar({ bookmarks, currentTimeMs, durationMs, onSeek, compact = false }: VideoBookmarkBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const clusters = useMemo(() => clusterBookmarks(bookmarks), [bookmarks]);
  const progress = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current || durationMs <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      onSeek((pct / 100) * durationMs);
    },
    [durationMs, onSeek],
  );

  const handleDotHover = useCallback(
    (clusterId: string, e: React.MouseEvent) => {
      setHoveredCluster(clusterId);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    },
    [],
  );

  if (durationMs <= 0 || bookmarks.length === 0) return null;

  const hovered = clusters.find((c) => c.id === hoveredCluster);

  return (
    <div className="relative group/bar select-none">
      {/* Legend */}
      {!compact && (
        <div className="flex items-center gap-3 mb-2">
          {(['strength', 'improvement', 'question', 'rubric'] as BookmarkType[]).map((type) => {
            const count = bookmarks.filter((b) => b.type === type).length;
            if (count === 0) return null;
            const c = TYPE_COLORS[type];
            return (
              <div key={type} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className="text-[10px] text-surface-500">
                  {TYPE_LABELS[type]} ({count})
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-3 bg-surface-200 rounded-full cursor-pointer overflow-visible"
        onClick={handleTrackClick}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-400 rounded-full pointer-events-none"
          style={{ width: `${Math.min(100, progress)}%` }}
        />

        {/* Bookmark dots */}
        {clusters.map((cluster) => {
          const pct = (cluster.position / durationMs) * 100;
          const isNear = Math.abs(currentTimeMs - cluster.position) < 2000;
          const colors = TYPE_COLORS[cluster.dominantType];
          const count = cluster.bookmarks.length;

          return (
            <motion.div
              key={cluster.id}
              className={`absolute top-1/2 -translate-y-1/2 z-10 ${count > 1 ? 'w-5 h-5' : 'w-3.5 h-3.5'} rounded-full ${colors.dot} border-2 border-white shadow-sm flex items-center justify-center cursor-pointer transition-all ${
                isNear ? `ring-4 ${colors.ring} scale-125` : ''
              }`}
              style={{ left: `${pct}%`, marginLeft: count > 1 ? '-10px' : '-7px' }}
              whileHover={{ scale: 1.4, y: -6 }}
              onMouseEnter={(e) => handleDotHover(cluster.id, e as unknown as React.MouseEvent)}
              onMouseLeave={() => setHoveredCluster(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(cluster.bookmarks[0].timestampMs);
              }}
              animate={isNear ? { scale: [1.15, 1.3, 1.15] } : {}}
              transition={isNear ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              {count > 1 && (
                <span className="text-[8px] font-bold text-white leading-none">{count}</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Tooltip card */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 pointer-events-none"
            style={{
              left: `${Math.max(160, Math.min(tooltipPos.x, typeof window !== 'undefined' ? window.innerWidth - 160 : 600))}px`,
              top: `${tooltipPos.y - 8}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-white rounded-xl shadow-xl border border-surface-200 p-3 w-72 max-h-64 overflow-y-auto">
              {hovered.bookmarks.length === 1 ? (
                <SingleBookmarkCard bookmark={hovered.bookmarks[0]} />
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">
                    {hovered.bookmarks.length} moments near {hovered.bookmarks[0].timestampLabel}
                  </p>
                  {hovered.bookmarks.map((bm) => (
                    <MiniBookmarkRow key={bm.id} bookmark={bm} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Card sub-components ────────────────────────────────────────────────────

function SingleBookmarkCard({ bookmark }: { bookmark: VideoBookmark }) {
  const c = TYPE_COLORS[bookmark.type];
  const Icon = TYPE_ICONS[bookmark.type];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
          {bookmark.timestampLabel}
        </span>
        <span className={`flex items-center gap-1 text-[10px] font-semibold ${c.text}`}>
          <Icon className="w-3 h-3" />
          {TYPE_LABELS[bookmark.type]}
        </span>
        {bookmark.criterion && (
          <span className="text-[10px] text-surface-400 truncate ml-auto max-w-[100px]" title={bookmark.criterion}>
            {bookmark.criterion}
          </span>
        )}
      </div>
      <p className="text-xs text-surface-700 leading-relaxed">{bookmark.text}</p>
      {bookmark.snippet && (
        <p className="mt-1.5 text-[10px] italic text-surface-500 border-l-2 border-surface-200 pl-2">
          &ldquo;{bookmark.snippet}&rdquo;
        </p>
      )}
    </div>
  );
}

function MiniBookmarkRow({ bookmark }: { bookmark: VideoBookmark }) {
  const c = TYPE_COLORS[bookmark.type];
  const Icon = TYPE_ICONS[bookmark.type];
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg ${c.bg} border ${c.border}`}>
      <Icon className={`w-3 h-3 flex-shrink-0 mt-0.5 ${c.text}`} />
      <div className="min-w-0 flex-1">
        <span className={`text-[10px] font-semibold ${c.text}`}>{TYPE_LABELS[bookmark.type]}</span>
        <p className="text-[10px] text-surface-700 leading-relaxed">{bookmark.text}</p>
      </div>
      <span className={`font-mono text-[9px] font-bold flex-shrink-0 ${c.text}`}>{bookmark.timestampLabel}</span>
    </div>
  );
}

// ─── Sidebar bookmark list (for modal) ──────────────────────────────────────

function BookmarkSidebarList({
  bookmarks,
  currentTimeMs,
  onSeek,
}: {
  bookmarks: VideoBookmark[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}) {
  const sorted = useMemo(
    () => [...bookmarks].sort((a, b) => a.timestampMs - b.timestampMs),
    [bookmarks],
  );

  // Active = closest bookmark within 5s of currentTimeMs
  const activeIdx = useMemo(() => {
    let best = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].timestampMs <= currentTimeMs + 5000) best = i;
    }
    return best;
  }, [sorted, currentTimeMs]);

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIdx]);

  return (
    <div className="space-y-1.5">
      {sorted.map((bm, i) => {
        const isActive = i === activeIdx;
        const c = TYPE_COLORS[bm.type];
        const Icon = TYPE_ICONS[bm.type];
        return (
          <button
            key={bm.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(bm.timestampMs)}
            className={`w-full text-left p-2.5 rounded-xl border transition-all ${
              isActive
                ? `${c.bg} ${c.border} shadow-sm`
                : 'bg-surface-50 border-surface-100 hover:bg-surface-100 hover:border-surface-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                {bm.timestampLabel}
              </span>
              <Icon className={`w-3 h-3 ${c.text}`} />
              <span className={`text-[10px] font-semibold ${c.text}`}>{TYPE_LABELS[bm.type]}</span>
              {bm.criterion && (
                <span className="ml-auto text-[9px] text-surface-400 truncate max-w-[80px]">{bm.criterion}</span>
              )}
            </div>
            <p className="text-[11px] text-surface-700 leading-relaxed">{bm.text}</p>
            {bm.snippet && (
              <p className="mt-1 text-[10px] italic text-surface-400 border-l-2 border-surface-200 pl-2">
                &ldquo;{bm.snippet}&rdquo;
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── VideoBookmarkModal (fullscreen expanded player) ────────────────────────

interface VideoBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string | null;
  bookmarks: VideoBookmark[];
  initialTimeMs?: number;
  title?: string;
}

export function VideoBookmarkModal({
  isOpen,
  onClose,
  videoUrl,
  bookmarks,
  initialTimeMs = 0,
  title = 'Presentation',
}: VideoBookmarkModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(initialTimeMs);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync initial time on open
  useEffect(() => {
    if (isOpen && videoRef.current && initialTimeMs > 0) {
      videoRef.current.currentTime = initialTimeMs / 1000;
    }
  }, [isOpen, initialTimeMs]);

  const handleSeek = useCallback((ms: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ms / 1000;
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-surface-900">{title}</h2>
              <span className="text-xs text-surface-400">{bookmarks.length} bookmarks</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-surface-100 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-surface-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Left: video + bookmark bar */}
            <div className="flex-1 flex flex-col p-6 min-w-0">
              {/* Video */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex-shrink-0">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    onTimeUpdate={(e) => setCurrentTimeMs(Math.round(e.currentTarget.currentTime * 1000))}
                    onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-surface-500 text-sm">
                    No video available
                  </div>
                )}
                {/* Play/pause overlay */}
                {videoUrl && (
                  <button
                    onClick={togglePlayPause}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors group"
                  >
                    <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      {isPlaying ? (
                        <Pause className="w-6 h-6 text-surface-700" />
                      ) : (
                        <Play className="w-6 h-6 text-surface-700 ml-0.5" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Bookmark bar */}
              <div className="mt-4">
                <VideoBookmarkBar
                  bookmarks={bookmarks}
                  currentTimeMs={currentTimeMs}
                  durationMs={durationMs}
                  onSeek={handleSeek}
                />
              </div>
            </div>

            {/* Right: bookmark list sidebar */}
            <div className="w-80 flex-shrink-0 border-l border-surface-100 flex flex-col">
              <div className="px-4 py-3 border-b border-surface-100">
                <h3 className="text-sm font-semibold text-surface-900">All Bookmarks</h3>
                <p className="text-[10px] text-surface-400 mt-0.5">Click to jump to that moment</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <BookmarkSidebarList
                  bookmarks={bookmarks}
                  currentTimeMs={currentTimeMs}
                  onSeek={handleSeek}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default VideoBookmarkBar;
