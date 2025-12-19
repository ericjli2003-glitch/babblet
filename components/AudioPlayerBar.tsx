'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Rewind,
  FastForward,
  Download,
} from 'lucide-react';

interface AudioPlayerBarProps {
  // Core controls
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onSeek: (timeMs: number) => void;
  
  // Optional features
  showSpeedControl?: boolean;
  showVolumeControl?: boolean;
  showDownload?: boolean;
  onDownload?: () => void;
  
  // Audio element ref for speed/volume control
  audioRef?: React.RefObject<HTMLAudioElement | HTMLVideoElement | null>;
  
  // Timeline markers (optional)
  markers?: Array<{ timestamp: number; type: 'question' | 'issue' | 'insight' }>;
  
  // Styling
  className?: string;
  compact?: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayerBar({
  isPlaying,
  currentTimeMs,
  durationMs,
  onPlayPause,
  onSeek,
  showSpeedControl = true,
  showVolumeControl = true,
  showDownload = false,
  onDownload,
  audioRef,
  markers = [],
  className = '',
  compact = false,
}: AudioPlayerBarProps) {
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Apply volume changes
  useEffect(() => {
    if (audioRef?.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted, audioRef]);

  // Apply speed changes
  useEffect(() => {
    if (audioRef?.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, audioRef]);

  const progress = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || durationMs <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percent * durationMs);
  };

  const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !progressRef.current || durationMs <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percent * durationMs);
  };

  const jumpBack = () => onSeek(Math.max(0, currentTimeMs - 10000));
  const jumpForward = () => onSeek(Math.min(durationMs, currentTimeMs + 10000));
  const skipBack = () => onSeek(Math.max(0, currentTimeMs - 5000));
  const skipForward = () => onSeek(Math.min(durationMs, currentTimeMs + 5000));

  const toggleMute = () => setIsMuted(!isMuted);

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setSpeed(SPEED_OPTIONS[nextIndex]);
  };

  // Get marker color
  const getMarkerColor = (type: string) => {
    switch (type) {
      case 'question': return 'bg-violet-500';
      case 'issue': return 'bg-amber-500';
      case 'insight': return 'bg-emerald-500';
      default: return 'bg-primary-500';
    }
  };

  return (
    <div
      className={`bg-gradient-to-r from-surface-800 to-surface-900 rounded-2xl px-4 py-3 shadow-xl ${className}`}
    >
      <div className={`flex items-center gap-3 ${compact ? '' : 'gap-4'}`}>
        {/* Jump back 10s */}
        {!compact && (
          <button
            onClick={jumpBack}
            className="p-1.5 text-surface-400 hover:text-white transition-colors"
            title="Back 10s"
          >
            <Rewind className="w-4 h-4" />
          </button>
        )}

        {/* Skip back 5s */}
        <button
          onClick={skipBack}
          className="p-1.5 text-surface-400 hover:text-white transition-colors"
          title="Back 5s"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onPlayPause}
          className="w-10 h-10 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 text-white flex items-center justify-center shadow-glow"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </motion.button>

        {/* Skip forward 5s */}
        <button
          onClick={skipForward}
          className="p-1.5 text-surface-400 hover:text-white transition-colors"
          title="Forward 5s"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Jump forward 10s */}
        {!compact && (
          <button
            onClick={jumpForward}
            className="p-1.5 text-surface-400 hover:text-white transition-colors"
            title="Forward 10s"
          >
            <FastForward className="w-4 h-4" />
          </button>
        )}

        {/* Time display */}
        <div className="text-sm text-surface-300 font-mono min-w-[90px]">
          {formatTime(currentTimeMs)}
          <span className="text-surface-500"> / </span>
          {formatTime(durationMs)}
        </div>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="flex-1 h-2 bg-surface-700 rounded-full cursor-pointer relative group"
          onClick={handleProgressClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleProgressDrag}
        >
          {/* Markers */}
          {markers.map((marker, i) => {
            const pos = durationMs > 0 ? (marker.timestamp / durationMs) * 100 : 0;
            return (
              <div
                key={i}
                className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${getMarkerColor(marker.type)} opacity-80`}
                style={{ left: `${pos}%`, transform: 'translate(-50%, -50%)' }}
              />
            );
          })}

          {/* Progress fill */}
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            {/* Scrub handle */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-1/2" />
          </div>
        </div>

        {/* Speed control */}
        {showSpeedControl && (
          <div className="relative">
            <button
              onClick={cycleSpeed}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowSpeedMenu(!showSpeedMenu);
              }}
              className="px-2 py-1 text-xs font-medium text-surface-300 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors min-w-[50px]"
              title="Click to cycle, right-click for menu"
            >
              {speed}x
            </button>
            
            {/* Speed menu */}
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 right-0 bg-surface-800 rounded-lg shadow-xl border border-surface-600 py-1 z-10">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-4 py-1.5 text-sm text-left hover:bg-surface-700 ${
                      speed === s ? 'text-primary-400' : 'text-surface-300'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Volume control */}
        {showVolumeControl && (
          <div className="flex items-center gap-2 group">
            <button
              onClick={toggleMute}
              className="p-1.5 text-surface-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            
            {/* Volume slider - visible on hover */}
            <div className="w-0 overflow-hidden group-hover:w-20 transition-all duration-200">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value));
                  setIsMuted(false);
                }}
                className="w-full h-1 bg-surface-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>
        )}

        {/* Download button */}
        {showDownload && onDownload && (
          <button
            onClick={onDownload}
            className="p-1.5 text-surface-400 hover:text-white transition-colors"
            title="Download recording"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

