'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { Play, Calendar, Volume2, Gauge, Expand } from 'lucide-react';
import TranscriptModal from './TranscriptModal';

interface TranscriptEntry {
  timestamp: string;
  timestampMs: number;
  text: string;
  isHighlighted?: boolean;
}

interface Alert {
  type: 'pacing' | 'volume';
  label: string;
  timeRange?: string;
}

interface VideoPanelProps {
  videoUrl?: string | null;
  filename: string;
  uploadDate: string;
  fileSize: string;
  alerts?: Alert[];
  transcriptEntries: TranscriptEntry[];
  onViewFullTranscript?: () => void;
  onTimeUpdate?: (currentTimeMs: number) => void;
  onDurationChange?: (durationMs: number) => void;
  currentTimeMs?: number;
  presentationTitle?: string;
}

export interface VideoPanelRef {
  seekTo: (timestampMs: number) => void;
  getCurrentTime: () => number;
}

const VideoPanel = forwardRef<VideoPanelRef, VideoPanelProps>(function VideoPanel({
  videoUrl,
  filename,
  uploadDate,
  fileSize,
  alerts = [],
  transcriptEntries,
  onViewFullTranscript,
  onTimeUpdate,
  onDurationChange,
  currentTimeMs = 0,
  presentationTitle = 'Presentation',
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    seekTo: (timestampMs: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = timestampMs / 1000;
        videoRef.current.play();
      }
    },
    getCurrentTime: () => {
      return videoRef.current ? videoRef.current.currentTime * 1000 : 0;
    },
  }));

  // Handle time updates directly via React event handler
  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (onTimeUpdate) {
      // Round to nearest 100ms to reduce unnecessary updates
      const timeMs = Math.round(video.currentTime * 10) * 100;
      onTimeUpdate(timeMs);
    }
  };

  // Also update during play using requestAnimationFrame for smoother tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animationId: number;
    let lastReportedTime = 0;

    const updateTime = () => {
      if (video && !video.paused && onTimeUpdate) {
        const currentMs = Math.round(video.currentTime * 10) * 100;
        if (currentMs !== lastReportedTime) {
          lastReportedTime = currentMs;
          onTimeUpdate(currentMs);
        }
      }
      animationId = requestAnimationFrame(updateTime);
    };

    const handlePlay = () => {
      animationId = requestAnimationFrame(updateTime);
    };

    const handlePause = () => {
      if (animationId) cancelAnimationFrame(animationId);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handlePause);

    // If already playing, start the animation loop
    if (!video.paused) {
      animationId = requestAnimationFrame(updateTime);
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handlePause);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [onTimeUpdate]);

  // Auto-scroll to highlighted segment
  useEffect(() => {
    if (transcriptRef.current) {
      const highlighted = transcriptRef.current.querySelector('[data-highlighted="true"]');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [transcriptEntries]);

  const handleVideoLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (onDurationChange && video.duration) {
      onDurationChange(video.duration * 1000);
    }
  };

  const seekTo = (timestampMs: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampMs / 1000;
      videoRef.current.play();
    }
  };

  return (
    <div className="w-full bg-surface-800 text-white h-full flex flex-col">
      {/* Video Player Section */}
      <div className="flex-shrink-0 p-4">
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full h-full object-cover"
              onTimeUpdate={handleVideoTimeUpdate}
              onLoadedMetadata={handleVideoLoadedMetadata}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-700 to-surface-900">
              <button className="w-16 h-16 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
                <Play className="w-8 h-8 text-white ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* File Info */}
        <div className="mt-4">
          <h3 className="font-medium text-sm truncate">{filename}</h3>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-surface-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>Uploaded {uploadDate}</span>
            <span>•</span>
            <span>{fileSize}</span>
          </div>
        </div>

        {/* Alert Badges */}
        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {alerts.map((alert, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  alert.type === 'pacing'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {alert.type === 'pacing' ? (
                  <Gauge className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
                {alert.label}
                {alert.timeRange && (
                  <span className="text-white/60">({alert.timeRange})</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Full Transcript - Scrollable */}
      <div className="flex-1 border-t border-surface-700 flex flex-col min-h-0">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-3 border-b border-surface-700 flex items-center justify-between bg-surface-800 hover:bg-surface-700/50 transition-colors flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm uppercase tracking-wide">Full Transcript</h4>
            <span className="text-xs text-surface-400">{transcriptEntries.length} segments</span>
          </div>
          <Expand className="w-4 h-4 text-surface-400" />
        </button>

        <div 
          ref={transcriptRef}
          className="flex-1 overflow-y-auto p-4 space-y-2"
        >
          {transcriptEntries.length > 0 ? (
            transcriptEntries.map((entry, i) => (
              <div
                key={i}
                data-highlighted={entry.isHighlighted}
                onClick={() => seekTo(entry.timestampMs)}
                className={`cursor-pointer rounded-lg p-3 transition-colors ${
                  entry.isHighlighted
                    ? 'bg-primary-500/30 border-l-2 border-primary-400'
                    : 'hover:bg-surface-700/50'
                }`}
              >
                <span className={`font-mono text-xs block mb-1 ${
                  entry.isHighlighted ? 'text-primary-300' : 'text-primary-400'
                }`}>
                  {entry.timestamp}
                </span>
                <p className={`text-sm leading-relaxed ${
                  entry.isHighlighted ? 'text-white font-medium' : 'text-surface-300'
                }`}>
                  {entry.text}
                </p>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-32 text-surface-500 text-sm">
              No transcript available
            </div>
          )}
        </div>
      </div>

      {/* Transcript Modal */}
      <TranscriptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={presentationTitle}
        videoUrl={videoUrl}
        transcriptEntries={transcriptEntries}
        onSeek={seekTo}
        currentTimeMs={currentTimeMs}
      />
    </div>
  );
});

export default VideoPanel;
