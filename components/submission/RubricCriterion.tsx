'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, Sparkles, FileText, Loader2, ChevronRight, Lightbulb, List, AlignLeft, MessageSquarePlus, X, Send, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Branch insight type
interface BranchInsight {
  id: string;
  query: string;
  response: string | null;
  isLoading: boolean;
}

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
  const [insightFormat, setInsightFormat] = useState<'bullets' | 'paragraphs'>('bullets');
  const [branches, setBranches] = useState<BranchInsight[]>([]);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const percentage = (score / maxScore) * 100;

  // Build citations from evidence
  const citations = useMemo(() => {
    return evidence.map((e, i) => ({
      id: i + 1,
      timestamp: e.timestamp || '',
      text: e.quote.slice(0, 40) + (e.quote.length > 40 ? '...' : ''),
    }));
  }, [evidence]);

  // Render insight content with format toggle
  const renderInsightContent = useCallback((content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    
    // Parse citations and bold
    const renderLine = (text: string) => {
      // Handle citations like [1], [2]
      const parts = text.split(/(\[\d+\])/g);
      return parts.map((part, i) => {
        const match = part.match(/\[(\d+)\]/);
        if (match) {
          const citationNum = parseInt(match[1]);
          const citation = citations[citationNum - 1];
          if (citation && citation.timestamp) {
            return (
              <span key={i} className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold text-amber-700 bg-amber-200 rounded-full mx-0.5" title={`${citation.timestamp}: ${citation.text}`}>
                {citationNum}
              </span>
            );
          }
        }
        // Handle bold
        if (part.includes('**')) {
          const boldParts = part.split(/\*\*(.*?)\*\*/g);
          return boldParts.map((bp, j) => 
            j % 2 === 1 ? <strong key={`${i}-${j}`} className="font-semibold">{bp}</strong> : bp
          );
        }
        return part;
      });
    };

    if (insightFormat === 'bullets') {
      return (
        <ul className="space-y-1.5">
          {lines.map((line, i) => {
            const cleanLine = line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '');
            if (!cleanLine.trim()) return null;
            const isHeader = line.startsWith('#');
            return (
              <li key={i} className={`flex items-start gap-2 ${isHeader ? 'mt-2' : ''}`}>
                {isHeader ? (
                  <span className="font-semibold">{renderLine(cleanLine)}</span>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <span>{renderLine(cleanLine)}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    return (
      <div className="space-y-2">
        {lines.map((line, i) => {
          if (line.startsWith('## ')) return <h3 key={i} className="font-semibold mt-2">{renderLine(line.replace('## ', ''))}</h3>;
          if (line.startsWith('- ') || line.startsWith('* ')) return <p key={i} className="pl-3">• {renderLine(line.slice(2))}</p>;
          return <p key={i}>{renderLine(line)}</p>;
        })}
      </div>
    );
  }, [insightFormat, citations]);

  // Handle branch creation
  const handleCreateBranch = useCallback(async () => {
    if (!branchQuery.trim() || !onRequestInsights) return;
    
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
      const response = await onRequestInsights(`${name} - specifically about: ${branchQuery}`);
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response, isLoading: false } : b
      ));
    } catch {
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response: 'Failed to generate insight.', isLoading: false } : b
      ));
    }
  }, [branchQuery, name, onRequestInsights]);

  const removeBranch = useCallback((branchId: string) => {
    setBranches(prev => prev.filter(b => b.id !== branchId));
  }, []);
  
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
                          {/* Header with format toggle */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <Lightbulb className="w-4 h-4 text-amber-600" />
                              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Babblet Insights</span>
                            </div>
                            <div className="flex items-center gap-0.5 bg-amber-100/50 rounded p-0.5">
                              <button
                                onClick={() => setInsightFormat('bullets')}
                                className={`p-1 rounded transition-colors ${insightFormat === 'bullets' ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500 hover:text-amber-600'}`}
                                title="Bullet format"
                              >
                                <List className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setInsightFormat('paragraphs')}
                                className={`p-1 rounded transition-colors ${insightFormat === 'paragraphs' ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-500 hover:text-amber-600'}`}
                                title="Paragraph format"
                              >
                                <AlignLeft className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Citations legend */}
                          {citations.length > 0 && citations.some(c => c.timestamp) && (
                            <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-amber-200 text-xs">
                              <span className="text-amber-600">Refs:</span>
                              {citations.filter(c => c.timestamp).map(c => (
                                <span key={c.id} className="text-amber-700">
                                  <span className="w-4 h-4 inline-flex items-center justify-center bg-amber-200 rounded-full text-[10px] font-semibold">{c.id}</span>
                                  <span className="font-mono ml-0.5">{c.timestamp}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Content */}
                          <div className="text-sm text-amber-900 leading-relaxed">
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
                                className="mt-3 ml-3 pl-3 border-l-2 border-amber-300"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <GitBranch className="w-3 h-3 text-amber-500" />
                                    <span className="text-xs font-medium text-amber-700">{branch.query}</span>
                                  </div>
                                  <button onClick={() => removeBranch(branch.id)} className="p-0.5 text-amber-400 hover:text-amber-600">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                {branch.isLoading ? (
                                  <div className="flex items-center gap-1.5 text-xs text-amber-600">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Generating...
                                  </div>
                                ) : branch.response && (
                                  <div className="text-sm text-amber-800 bg-amber-100/50 rounded p-2">
                                    {renderInsightContent(branch.response)}
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </AnimatePresence>

                          {/* Add branch */}
                          <div className="mt-3 pt-2 border-t border-amber-200">
                            <AnimatePresence mode="wait">
                              {showBranchInput ? (
                                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={branchQuery}
                                    onChange={(e) => setBranchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                                    placeholder="Ask a follow-up..."
                                    className="flex-1 px-2 py-1.5 text-sm bg-white border border-amber-200 rounded focus:ring-1 focus:ring-amber-300 outline-none"
                                    autoFocus
                                  />
                                  <button onClick={handleCreateBranch} disabled={!branchQuery.trim()} className="p-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50">
                                    <Send className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => { setShowBranchInput(false); setBranchQuery(''); }} className="p-1.5 text-amber-500 hover:text-amber-700">
                                    <X className="w-3 h-3" />
                                  </button>
                                </motion.div>
                              ) : (
                                <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowBranchInput(true)} className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium">
                                  <MessageSquarePlus className="w-3.5 h-3.5" />
                                  Ask follow-up
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
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
