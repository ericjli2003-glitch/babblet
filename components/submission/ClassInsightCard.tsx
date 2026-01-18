'use client';

import { useState } from 'react';
import { ChevronDown, BookOpen, Lightbulb, ExternalLink, PlayCircle, CheckCircle, AlertTriangle, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ClassInsightCardProps {
  title: string;
  score?: number;
  maxScore?: number;
  status: 'excellent' | 'good' | 'needs_improvement' | 'missing';
  moduleReference?: string;
  feedback: string;
  suggestedAction?: {
    text: string;
    linkText?: string;
    linkUrl?: string;
  };
  evidence?: Array<{
    timestamp: string;
    text: string;
  }>;
  courseAlignment?: number;
  defaultExpanded?: boolean;
  onSeekToTime?: (timeMs: number) => void;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

const statusConfig = {
  excellent: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Excellent',
  },
  good: {
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Good',
  },
  needs_improvement: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Needs Improvement',
  },
  missing: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: 'Missing',
  },
};

export default function ClassInsightCard({
  title,
  score,
  maxScore,
  status,
  moduleReference,
  feedback,
  suggestedAction,
  evidence,
  courseAlignment,
  defaultExpanded = false,
  onSeekToTime,
}: ClassInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className={`bg-white rounded-2xl border ${config.borderColor} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-start justify-between hover:bg-surface-50/50 transition-colors text-left"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
            <StatusIcon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-surface-900">{title}</h3>
              {moduleReference && (
                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                  {moduleReference}
                </span>
              )}
            </div>
            {!isExpanded && (
              <p className="text-sm text-surface-500 mt-1 line-clamp-2">{feedback}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {score !== undefined && maxScore !== undefined && (
            <div className="text-right">
              <span className="text-lg font-bold text-surface-900">{score}</span>
              <span className="text-sm text-surface-400">/{maxScore}</span>
            </div>
          )}
          <ChevronDown
            className={`w-5 h-5 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Feedback */}
              <div className="pl-13">
                <p className="text-sm text-surface-700 leading-relaxed">{feedback}</p>
              </div>

              {/* Course Alignment */}
              {courseAlignment !== undefined && (
                <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                  <Target className="w-4 h-4 text-primary-500" />
                  <span className="text-sm text-surface-600">Course Material Alignment:</span>
                  <span className="text-sm font-semibold text-primary-600">{courseAlignment}%</span>
                  <div className="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${courseAlignment}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Evidence from Video */}
              {evidence && evidence.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <PlayCircle className="w-3.5 h-3.5" />
                    Evidence in Presentation
                  </p>
                  <div className="space-y-2">
                    {evidence.map((e, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg group"
                      >
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onSeekToTime?.(parseTimestamp(e.timestamp));
                          }}
                          className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-mono font-medium rounded hover:bg-primary-200 transition-colors"
                        >
                          {e.timestamp}
                        </button>
                        <p className="text-sm text-surface-600 flex-1">{e.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Action */}
              {suggestedAction && (
                <div className={`p-4 ${config.bgColor} rounded-xl border ${config.borderColor}`}>
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Suggested Action
                  </p>
                  <p className="text-sm text-surface-700">{suggestedAction.text}</p>
                  {suggestedAction.linkText && suggestedAction.linkUrl && (
                    <a
                      href={suggestedAction.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      {suggestedAction.linkText}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
