'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, BookOpen, Lightbulb, ExternalLink, PlayCircle, CheckCircle, AlertTriangle, Target, Loader2, Sparkles, ChevronRight } from 'lucide-react';
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
    analysis?: string; // Explanation of how this evidence relates to the criterion
  }>;
  courseAlignment?: number;
  defaultExpanded?: boolean;
  onSeekToTime?: (timeMs: number) => void;
  onRequestMoreInsights?: (criterionTitle: string) => Promise<string>;
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
  onRequestMoreInsights,
}: ClassInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [additionalInsights, setAdditionalInsights] = useState<string | null>(null);
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  
  const handleRequestInsights = useCallback(async () => {
    if (!onRequestMoreInsights || isLoadingInsights) return;
    
    setIsLoadingInsights(true);
    try {
      const insights = await onRequestMoreInsights(title);
      setAdditionalInsights(insights);
    } catch (err) {
      console.error('Failed to get insights:', err);
      setAdditionalInsights('Unable to load additional insights. Please try again.');
    } finally {
      setIsLoadingInsights(false);
    }
  }, [title, onRequestMoreInsights, isLoadingInsights]);

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
                  <div className="space-y-3">
                    {evidence.map((e, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-surface-50 rounded-lg border border-surface-100"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSeekToTime?.(parseTimestamp(e.timestamp));
                            }}
                            className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-mono font-medium rounded hover:bg-primary-200 transition-colors flex-shrink-0"
                          >
                            {e.timestamp}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-surface-700 italic mb-1">&ldquo;{e.text}&rdquo;</p>
                            {e.analysis && (
                              <p className="text-xs text-surface-500 mt-2 pl-3 border-l-2 border-primary-200">
                                <span className="font-medium text-primary-600">Analysis:</span> {e.analysis}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Get More Insights Button */}
              {onRequestMoreInsights && (
                <div className="pt-3 border-t border-surface-100">
                  <button
                    onClick={handleRequestInsights}
                    disabled={isLoadingInsights}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    {isLoadingInsights ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isLoadingInsights ? 'Generating insights...' : additionalInsights ? 'Refresh Insights' : 'Get More Insights'}
                    {!isLoadingInsights && !additionalInsights && <ChevronRight className="w-3 h-3" />}
                  </button>
                  
                  {/* Additional Insights Panel */}
                  <AnimatePresence>
                    {additionalInsights && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-xl">
                          <div className="flex items-center gap-1.5 mb-3">
                            <Sparkles className="w-4 h-4 text-primary-600" />
                            <span className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Babblet Insights</span>
                          </div>
                          <div className="text-sm text-surface-800 leading-relaxed prose prose-sm max-w-none prose-headings:text-surface-900 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-strong:text-surface-900 prose-ul:my-2 prose-li:my-0.5">
                            {additionalInsights.split('\n').map((line, i) => {
                              // Handle headers
                              if (line.startsWith('## ')) {
                                return <h3 key={i} className="text-base font-semibold text-surface-900 mt-3 mb-2">{line.replace('## ', '')}</h3>;
                              }
                              if (line.startsWith('# ')) {
                                return <h2 key={i} className="text-lg font-semibold text-surface-900 mt-3 mb-2">{line.replace('# ', '')}</h2>;
                              }
                              // Handle bold text with **
                              if (line.includes('**')) {
                                const parts = line.split(/\*\*(.*?)\*\*/g);
                                return (
                                  <p key={i} className="my-1.5">
                                    {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="font-semibold text-surface-900">{part}</strong> : part)}
                                  </p>
                                );
                              }
                              // Handle list items
                              if (line.startsWith('- ') || line.startsWith('* ')) {
                                return <li key={i} className="ml-4 list-disc my-0.5">{line.slice(2)}</li>;
                              }
                              // Empty lines
                              if (line.trim() === '') {
                                return <div key={i} className="h-2" />;
                              }
                              // Regular paragraphs
                              return <p key={i} className="my-1.5">{line}</p>;
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
