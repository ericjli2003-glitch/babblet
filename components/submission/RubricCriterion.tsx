'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, Sparkles, FileText, Loader2, ChevronRight, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EvidenceItem {
  timestamp?: string;
  quote: string;
  analysis: string;
}

interface RubricCriterionProps {
  index: number;
  name: string;
  score: number;
  maxScore: number;
  scaleLabels?: [string, string, string];
  rationale?: string;
  evidence?: EvidenceItem[];
  onScoreChange?: (score: number) => void;
  onRationaleChange?: (rationale: string) => void;
  onRequestInsights?: (criterionName: string) => Promise<string>;
}

export default function RubricCriterion({
  index,
  name,
  score,
  maxScore,
  scaleLabels = ['Poor', 'Average', 'Excellent'],
  rationale = '',
  evidence = [],
  onScoreChange,
  onRationaleChange,
  onRequestInsights,
}: RubricCriterionProps) {
  const [isExpanded, setIsExpanded] = useState(index === 0);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [additionalInsights, setAdditionalInsights] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const percentage = (score / maxScore) * 100;
  
  const handleRequestInsights = useCallback(async () => {
    if (!onRequestInsights || isLoadingInsights) return;
    
    setIsLoadingInsights(true);
    setShowInsights(true);
    try {
      const insights = await onRequestInsights(name);
      setAdditionalInsights(insights);
    } catch (err) {
      console.error('Failed to get insights:', err);
      setAdditionalInsights('Failed to load additional insights. Please try again.');
    } finally {
      setIsLoadingInsights(false);
    }
  }, [name, onRequestInsights, isLoadingInsights]);

  return (
    <div className="border border-surface-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-surface-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold">
            {index + 1}
          </span>
          <span className="font-medium text-surface-900">{name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            <span className="font-semibold text-primary-600">{score}</span>
            <span className="text-surface-400"> / {maxScore}</span>
          </span>
          <ChevronDown
            className={`w-5 h-5 text-surface-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 bg-white space-y-4">
              {/* Score Slider */}
              <div>
                <div className="flex justify-between text-xs text-surface-400 mb-2">
                  <span>{scaleLabels[0]}</span>
                  <span>{scaleLabels[1]}</span>
                  <span>{scaleLabels[2]}</span>
                </div>
                <div className="relative">
                  <div className="h-2 bg-surface-100 rounded-full" />
                  <div
                    className="absolute top-0 left-0 h-2 bg-gradient-to-r from-surface-300 via-primary-400 to-primary-600 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-primary-500 rounded-full shadow-sm cursor-pointer"
                    style={{ left: `calc(${percentage}% - 8px)` }}
                  />
                </div>
              </div>

              {/* Rationale */}
              <div>
                <label className="text-xs font-semibold text-surface-500 uppercase tracking-wide block mb-2">
                  Rationale
                </label>
                <div className="relative">
                  <textarea
                    value={rationale}
                    onChange={(e) => onRationaleChange?.(e.target.value)}
                    placeholder="Add feedback here..."
                    className="w-full h-20 px-3 py-2 pr-10 text-sm border border-surface-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button className="absolute bottom-3 right-3 p-1 text-surface-400 hover:text-primary-500 transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Evidence in Presentation */}
              {evidence && evidence.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-surface-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <FileText className="w-3.5 h-3.5" />
                    Evidence in Presentation
                  </label>
                  <div className="space-y-2">
                    {evidence.map((item, i) => (
                      <div key={i} className="bg-surface-50 rounded-lg p-3 border border-surface-100">
                        <div className="flex items-start gap-2">
                          {item.timestamp && (
                            <span className="text-xs font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                              {item.timestamp}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-surface-700 italic mb-1">&ldquo;{item.quote}&rdquo;</p>
                            <p className="text-xs text-surface-500">{item.analysis}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expand for Additional Insights */}
              {onRequestInsights && (
                <div className="pt-2 border-t border-surface-100">
                  <button
                    onClick={handleRequestInsights}
                    disabled={isLoadingInsights}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    {isLoadingInsights ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lightbulb className="w-4 h-4" />
                    )}
                    {isLoadingInsights ? 'Loading insights...' : showInsights ? 'Refresh Insights' : 'Get Additional Insights'}
                    {!isLoadingInsights && !showInsights && <ChevronRight className="w-3 h-3" />}
                  </button>
                  
                  {/* Additional Insights Panel */}
                  <AnimatePresence>
                    {showInsights && additionalInsights && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Lightbulb className="w-4 h-4 text-amber-600" />
                            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">AI Insights</span>
                          </div>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{additionalInsights}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
