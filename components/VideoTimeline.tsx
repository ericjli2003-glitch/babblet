'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircleQuestion, AlertTriangle, Lightbulb } from 'lucide-react';

interface TimelineMarker {
  id: string;
  timestamp: number; // in milliseconds
  type: 'question' | 'issue' | 'insight';
  title: string;
  description?: string;
  category?: string;
}

interface VideoTimelineProps {
  currentTime: number; // in milliseconds
  duration: number; // in seconds
  markers: TimelineMarker[];
  onSeek: (timeMs: number) => void;
  onMarkerClick?: (marker: TimelineMarker) => void;
  activeMarkerId?: string | null; // Highlighted marker
}

export default function VideoTimeline({
  currentTime,
  duration,
  markers,
  onSeek,
  onMarkerClick,
  activeMarkerId,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoveredMarker, setHoveredMarker] = useState<TimelineMarker | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const durationMs = duration * 1000;
  const progress = durationMs > 0 ? (currentTime / durationMs) * 100 : 0;

  // Calculate marker position as percentage
  const getMarkerPosition = (timestamp: number) => {
    if (durationMs <= 0) return 0;
    return (timestamp / durationMs) * 100;
  };

  // Handle click/drag on track
  const handleTrackInteraction = useCallback(
    (clientX: number) => {
      if (!trackRef.current || durationMs <= 0) return;

      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newTimeMs = (percentage / 100) * durationMs;
      onSeek(newTimeMs);
    },
    [durationMs, onSeek]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleTrackInteraction(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      handleTrackInteraction(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Get marker icon and color
  const getMarkerStyle = (type: TimelineMarker['type']) => {
    switch (type) {
      case 'question':
        return { color: 'bg-primary-500', icon: MessageCircleQuestion, hoverColor: 'bg-primary-600' };
      case 'issue':
        return { color: 'bg-amber-500', icon: AlertTriangle, hoverColor: 'bg-amber-600' };
      case 'insight':
        return { color: 'bg-emerald-500', icon: Lightbulb, hoverColor: 'bg-emerald-600' };
      default:
        return { color: 'bg-surface-500', icon: MessageCircleQuestion, hoverColor: 'bg-surface-600' };
    }
  };

  return (
    <div className="relative w-full">
      {/* Main track */}
      <div
        ref={trackRef}
        className="relative h-3 bg-surface-700 rounded-full cursor-pointer group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Progress fill */}
        <motion.div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full"
          style={{ width: `${progress}%` }}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: isDragging ? 0 : 0.1 }}
        />

        {/* Playhead */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary-500 cursor-grab active:cursor-grabbing"
          style={{ left: `calc(${progress}% - 8px)` }}
          whileHover={{ scale: 1.2 }}
        />

        {/* Markers */}
        {markers.map((marker) => {
          const position = getMarkerPosition(marker.timestamp);
          const style = getMarkerStyle(marker.type);
          const Icon = style.icon;
          const isActive = marker.id === activeMarkerId;

          return (
            <motion.div
              key={marker.id}
              className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full ${style.color} flex items-center justify-center cursor-pointer shadow-md border-2 border-white z-10 ${isActive ? 'ring-4 ring-white/80 scale-125' : ''}`}
              style={{ left: `calc(${position}% - 10px)` }}
              whileHover={{ scale: 1.3, y: -4 }}
              animate={isActive ? { scale: 1.25, y: -2 } : { scale: 1, y: 0 }}
              onMouseEnter={(e) => {
                setHoveredMarker(marker);
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
              }}
              onMouseLeave={() => setHoveredMarker(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(marker.timestamp);
                onMarkerClick?.(marker);
              }}
            >
              <Icon className="w-3 h-3 text-white" />
            </motion.div>
          );
        })}
      </div>

      {/* Tooltip - positioned ABOVE the timeline */}
      <AnimatePresence>
        {hoveredMarker && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed z-[100] pointer-events-none"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y - 16,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-surface-900 text-white px-4 py-3 rounded-xl shadow-2xl max-w-sm border border-surface-700">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  hoveredMarker.type === 'question' ? 'bg-primary-500' :
                  hoveredMarker.type === 'issue' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}>
                  {hoveredMarker.type === 'question' ? '❓ Question' :
                   hoveredMarker.type === 'issue' ? '⚠️ Issue' : '💡 Insight'}
                </span>
                <span className="text-xs text-surface-400 font-mono">
                  {formatTime(hoveredMarker.timestamp)}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug">{hoveredMarker.title}</p>
              {hoveredMarker.description && (
                <p className="text-xs text-surface-400 mt-2 line-clamp-2">
                  {hoveredMarker.description}
                </p>
              )}
            </div>
            {/* Arrow pointing down */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-surface-900" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Marker Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-surface-400">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
          <span>Questions</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Issues</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Insights</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Export marker type for use elsewhere
export type { TimelineMarker };

