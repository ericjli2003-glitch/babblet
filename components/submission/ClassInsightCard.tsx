'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, BookOpen, Lightbulb, ExternalLink, PlayCircle, CheckCircle, AlertTriangle, Target, Loader2, Sparkles, ChevronRight, MessageSquarePlus, X, Send, GitBranch, ChevronUp, Trash2, EyeOff } from 'lucide-react';
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

// Branch insight type for user-created follow-ups
interface BranchInsight {
  id: string;
  query: string;
  response: string | null;
  isLoading: boolean;
}

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
  const [isInsightsHidden, setIsInsightsHidden] = useState(false);
  const [branches, setBranches] = useState<BranchInsight[]>([]);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  // Build citations from evidence
  const citations = useMemo(() => {
    if (!evidence) return [];
    return evidence.map((e, i) => ({
      id: i + 1,
      timestamp: e.timestamp,
      text: e.text.slice(0, 50) + (e.text.length > 50 ? '...' : ''),
    }));
  }, [evidence]);
  
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

  // Handle creating a new branch insight
  const handleCreateBranch = useCallback(async () => {
    if (!branchQuery.trim() || !onRequestMoreInsights) return;
    
    const newBranch: BranchInsight = {
      id: `branch-${Date.now()}`,
      query: branchQuery,
      response: null,
      isLoading: true,
    };
    
    setBranches(prev => [...prev, newBranch]);
    setBranchQuery('');
    setShowBranchInput(false);
    
    try {
      const response = await onRequestMoreInsights(`${title} - specifically about: ${branchQuery}`);
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response, isLoading: false } : b
      ));
    } catch (err) {
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response: 'Failed to generate insight. Please try again.', isLoading: false } : b
      ));
    }
  }, [branchQuery, title, onRequestMoreInsights]);

  // Remove a branch
  const removeBranch = useCallback((branchId: string) => {
    setBranches(prev => prev.filter(b => b.id !== branchId));
  }, []);

  // Render insight content with citations at end of bullet points
  const renderInsightContent = useCallback((content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    
    // Parse citations in text like [1], [2] - render as clickable buttons
    const renderCitationButton = (citationNum: number, key: string) => {
      const citation = citations[citationNum - 1];
      if (citation) {
        return (
          <button
            key={key}
            onClick={() => onSeekToTime?.(parseTimestamp(citation.timestamp))}
            className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-primary-700 bg-primary-100 rounded-full hover:bg-primary-200 transition-colors mx-0.5"
            title={`Jump to ${citation.timestamp}: "${citation.text}"`}
          >
            {citationNum}
          </button>
        );
      }
      return null;
    };

    // Extract citation numbers from text
    const extractCitations = (text: string): number[] => {
      const matches = text.match(/\[(\d+)\]/g) || [];
      return matches.map(m => parseInt(m.replace(/[\[\]]/g, '')));
    };

    // Remove inline citations from text
    const stripCitations = (text: string): string => {
      return text.replace(/\[\d+\]/g, '').trim();
    };

    // Render text with bold formatting (but without inline citations)
    const renderText = (text: string) => {
      const cleanText = stripCitations(text);
      if (cleanText.includes('**')) {
        const boldParts = cleanText.split(/\*\*(.*?)\*\*/g);
        return boldParts.map((bp, j) => 
          j % 2 === 1 ? <strong key={j} className="font-semibold text-surface-900">{bp}</strong> : bp
        );
      }
      return cleanText;
    };

    return (
      <div className="space-y-2">
        {lines.map((line, i) => {
          const lineCitations = extractCitations(line);
          
          if (line.startsWith('## ')) {
            return (
              <h3 key={i} className="text-base font-semibold text-surface-900 mt-3 mb-1">
                {renderText(line.replace('## ', ''))}
              </h3>
            );
          }
          if (line.startsWith('# ')) {
            return (
              <h2 key={i} className="text-lg font-semibold text-surface-900 mt-3 mb-1">
                {renderText(line.replace('# ', ''))}
              </h2>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <p key={i} className="text-surface-700 pl-4 flex items-start gap-1 flex-wrap">
                <span>• {renderText(line.slice(2))}</span>
                {lineCitations.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 ml-1">
                    {lineCitations.map((num, idx) => renderCitationButton(num, `${i}-${idx}`))}
                  </span>
                )}
              </p>
            );
          }
          return (
            <p key={i} className="text-surface-700 flex items-start gap-1 flex-wrap">
              <span>{renderText(line)}</span>
              {lineCitations.length > 0 && (
                <span className="inline-flex items-center gap-0.5 ml-1">
                  {lineCitations.map((num, idx) => renderCitationButton(num, `${i}-${idx}`))}
                </span>
              )}
            </p>
          );
        })}
      </div>
    );
  }, [citations, onSeekToTime]);

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
                          {/* Header with hide/delete controls */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-primary-600" />
                              <span className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Babblet Insights</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setIsInsightsHidden(!isInsightsHidden)}
                                className="p-1.5 text-surface-400 hover:text-surface-600 rounded-md hover:bg-white/50 transition-colors"
                                title={isInsightsHidden ? 'Show insights' : 'Hide insights'}
                              >
                                {isInsightsHidden ? <ChevronDown className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => {
                                  setAdditionalInsights(null);
                                  setBranches([]);
                                }}
                                className="p-1.5 text-surface-400 hover:text-red-500 rounded-md hover:bg-white/50 transition-colors"
                                title="Delete insights"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Collapsible content */}
                          <AnimatePresence>
                            {!isInsightsHidden && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                {/* Insight content - references are now inline at end of bullet points */}
                                <div className="text-sm leading-relaxed">
                                  {renderInsightContent(additionalInsights)}
                                </div>

                                {/* Branch insights */}
                                <AnimatePresence>
                                  {branches.map((branch) => (
                                    <motion.div
                                      key={branch.id}
                                      initial={{ opacity: 0, y: -10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -10 }}
                                      className="mt-4 ml-4 pl-4 border-l-2 border-primary-200"
                                    >
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                          <GitBranch className="w-3.5 h-3.5 text-primary-500" />
                                          <span className="text-xs font-medium text-primary-700">{branch.query}</span>
                                        </div>
                                        <button
                                          onClick={() => removeBranch(branch.id)}
                                          className="p-1 text-surface-400 hover:text-red-500 rounded-full hover:bg-white/50"
                                          title="Delete this branch"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      {branch.isLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-primary-600">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Generating insight...
                                        </div>
                                      ) : branch.response && (
                                        <div className="text-sm text-surface-700 bg-white/40 rounded-lg p-3">
                                          {renderInsightContent(branch.response)}
                                        </div>
                                      )}
                                    </motion.div>
                                  ))}
                                </AnimatePresence>

                                {/* Add branch button/input */}
                                <div className="mt-4 pt-3 border-t border-primary-100">
                                  <AnimatePresence mode="wait">
                                    {showBranchInput ? (
                                      <motion.div
                                        key="input"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="text"
                                          value={branchQuery}
                                          onChange={(e) => setBranchQuery(e.target.value)}
                                          onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                                          placeholder="Ask a follow-up question..."
                                          className="flex-1 px-3 py-2 text-sm bg-white border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-300 focus:border-primary-300 outline-none"
                                          autoFocus
                                        />
                                        <button
                                          onClick={handleCreateBranch}
                                          disabled={!branchQuery.trim()}
                                          className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          <Send className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setShowBranchInput(false);
                                            setBranchQuery('');
                                          }}
                                          className="p-2 text-surface-500 hover:text-surface-700 transition-colors"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </motion.div>
                                    ) : (
                                      <motion.button
                                        key="button"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setShowBranchInput(true)}
                                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                                      >
                                        <MessageSquarePlus className="w-4 h-4" />
                                        Ask a follow-up
                                      </motion.button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Collapsed state indicator */}
                          {isInsightsHidden && (
                            <button
                              onClick={() => setIsInsightsHidden(false)}
                              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                              <ChevronDown className="w-3 h-3" />
                              Show insights
                            </button>
                          )}
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
