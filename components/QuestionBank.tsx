'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Brain,
  Expand,
  ChevronDown,
  ChevronRight,
  Star,
  Copy,
  Check,
  Sparkles,
  FileSearch,
  AlertTriangle,
  Swords,
  Globe,
  Link,
  Scale,
  Microscope,
  AlertCircle,
  Rocket,
} from 'lucide-react';
import type { GeneratedQuestion, QuestionDifficulty } from '@/lib/types';
import { config as appConfig } from '@/lib/config';

interface QuestionBankProps {
  questions: {
    // New comprehensive categories
    clarification?: GeneratedQuestion[];
    evidence?: GeneratedQuestion[];
    assumption?: GeneratedQuestion[];
    counterargument?: GeneratedQuestion[];
    application?: GeneratedQuestion[];
    synthesis?: GeneratedQuestion[];
    evaluation?: GeneratedQuestion[];
    methodology?: GeneratedQuestion[];
    limitation?: GeneratedQuestion[];
    implication?: GeneratedQuestion[];
    // Legacy categories (backwards compatibility)
    clarifying?: GeneratedQuestion[];
    criticalThinking?: GeneratedQuestion[];
    expansion?: GeneratedQuestion[];
  };
  /** Used for export sizing (best set is clamped to 8–12 by config) */
  maxQuestions?: number;
  isLoading?: boolean;
  onSelectMarker?: (markerId: string) => void;
}

// Category configuration with icons and colors for all categories
const categoryConfig: Record<string, { icon: typeof HelpCircle; label: string; color: string; bgColor: string }> = {
  // New comprehensive categories
  clarification: {
    icon: HelpCircle,
    label: 'Clarification',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  evidence: {
    icon: FileSearch,
    label: 'Evidence Request',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  assumption: {
    icon: AlertTriangle,
    label: 'Assumption Challenge',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  counterargument: {
    icon: Swords,
    label: 'Counterargument',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  application: {
    icon: Globe,
    label: 'Application',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  synthesis: {
    icon: Link,
    label: 'Synthesis',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
  },
  evaluation: {
    icon: Scale,
    label: 'Evaluation',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  methodology: {
    icon: Microscope,
    label: 'Methodology',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  limitation: {
    icon: AlertCircle,
    label: 'Limitation',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  implication: {
    icon: Rocket,
    label: 'Implication',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
  // Legacy categories
  clarifying: {
    icon: HelpCircle,
    label: 'Clarifying Questions',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  'critical-thinking': {
    icon: Brain,
    label: 'Critical Thinking',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  criticalThinking: {
    icon: Brain,
    label: 'Critical Thinking',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  expansion: {
    icon: Expand,
    label: 'Expansion Questions',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
  },
};

const difficultyColors: Record<QuestionDifficulty, string> = {
  easy: 'badge-easy',
  medium: 'badge-medium',
  hard: 'badge-hard',
};

function QuestionCard({ question, onSelect }: { question: GeneratedQuestion; onSelect?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(question.question);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="question-card group cursor-pointer hover:border-primary-200"
      onClick={onSelect}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-surface-800 text-sm leading-relaxed">
              {question.question}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {question.rubricCriterion && (
              <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
                {question.rubricCriterion}
              </span>
            )}
            <span className={`badge ${difficultyColors[question.difficulty]}`}>
              {question.difficulty}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {question.rationale && (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Why this question?
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-3 bg-surface-50 rounded-xl text-xs text-surface-600 leading-relaxed">
                    <Star className="w-3 h-3 inline mr-1 text-amber-500" />
                    {question.rationale}
                    {(question.rubricJustification || question.expectedEvidenceType || question.bloomLevel) && (
                      <div className="mt-2 space-y-1 text-xs text-surface-600">
                        {question.rubricJustification && (
                          <div>
                            <span className="font-medium text-surface-700">Rubric fit:</span>{' '}
                            {question.rubricJustification}
                          </div>
                        )}
                        {question.expectedEvidenceType && (
                          <div>
                            <span className="font-medium text-surface-700">Evidence to ask for:</span>{' '}
                            {question.expectedEvidenceType}
                          </div>
                        )}
                        {question.bloomLevel && (
                          <div>
                            <span className="font-medium text-surface-700">Bloom:</span> {question.bloomLevel}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
}

function CategorySection({
  category,
  questions,
  onSelectMarker,
}: {
  category: string;
  questions: GeneratedQuestion[];
  onSelectMarker?: (markerId: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Get config with fallback for unknown categories
  const config = categoryConfig[category] || categoryConfig.clarification;
  const Icon = config.icon;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl ${config.bgColor} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>
          <h4 className="font-medium text-surface-800">{config.label}</h4>
          <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
            {questions.length}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isCollapsed ? -90 : 0 }}
          className="text-surface-400"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {questions.length === 0 ? (
              <p className="text-sm text-surface-400 italic px-2 py-4 text-center">
                No questions generated yet
              </p>
            ) : (
              questions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onSelect={() => onSelectMarker?.(`q-${question.id}`)}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QuestionBank({ questions, maxQuestions, isLoading, onSelectMarker }: QuestionBankProps) {
  const [isExported, setIsExported] = useState(false);
  
  // Dynamically collect all questions from all categories
  const allCategories = Object.keys(questions) as Array<keyof typeof questions>;
  const flattened: GeneratedQuestion[] = allCategories.flatMap(cat => questions[cat] || []);
  const totalQuestions = flattened.length;
  
  // Get non-empty categories for display
  const nonEmptyCategories = allCategories.filter(cat => (questions[cat]?.length || 0) > 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-surface-900">Question Bank</h3>
            {isLoading && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary-50 text-primary-600 rounded-full text-xs font-medium">
                <Sparkles className="w-3 h-3 animate-pulse" />
                <span>Generating...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const minN = appConfig.ui.exportBestSetMin;
                const maxN = appConfig.ui.exportBestSetMax;
                const n = Math.min(
                  maxN,
                  Math.max(1, Math.max(minN, maxQuestions ?? maxN))
                );

                const best = [...flattened].sort((a, b) => {
                  const sa = a.score ?? 0;
                  const sb = b.score ?? 0;
                  if (sb !== sa) return sb - sa;
                  return a.timestamp - b.timestamp;
                }).slice(0, Math.min(n, flattened.length));

                const lines = best.map((q, i) => {
                  const meta: string[] = [];
                  if (q.rubricCriterion) meta.push(`criterion: ${q.rubricCriterion}`);
                  meta.push(`type: ${q.category}`);
                  meta.push(`difficulty: ${q.difficulty}`);
                  return `${i + 1}. ${q.question}${meta.length ? ` (${meta.join(', ')})` : ''}`;
                });

                const text = `Best Questions (${best.length})\n\n${lines.join('\n')}\n`;
                await navigator.clipboard.writeText(text);
                setIsExported(true);
                setTimeout(() => setIsExported(false), 2000);
              }}
              disabled={flattened.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border border-surface-200 bg-white hover:bg-surface-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Copy the best 8–12 questions to clipboard"
            >
              {isExported ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {isExported ? 'Copied' : 'Export best set'}
            </button>
            <span className="text-sm text-surface-500">{totalQuestions} questions</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {totalQuestions === 0 && !isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-surface-400">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm text-center">
              Questions will appear here as Babblet analyzes the presentation
            </p>
          </div>
        ) : (
          <>
            {/* Render all non-empty categories dynamically */}
            {nonEmptyCategories.map(category => (
              <CategorySection 
                key={category} 
                category={category} 
                questions={questions[category] || []} 
                onSelectMarker={onSelectMarker} 
              />
            ))}
            {/* Show legacy categories if new categories are empty but legacy exist */}
            {nonEmptyCategories.length === 0 && (
              <>
                {(questions.clarifying?.length || 0) > 0 && (
                  <CategorySection category="clarifying" questions={questions.clarifying || []} onSelectMarker={onSelectMarker} />
                )}
                {(questions.criticalThinking?.length || 0) > 0 && (
                  <CategorySection category="criticalThinking" questions={questions.criticalThinking || []} onSelectMarker={onSelectMarker} />
                )}
                {(questions.expansion?.length || 0) > 0 && (
                  <CategorySection category="expansion" questions={questions.expansion || []} onSelectMarker={onSelectMarker} />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-surface-100 bg-surface-50/50">
        <p className="text-xs text-surface-500 text-center">
          Questions are generated based on presentation content
        </p>
      </div>
    </div>
  );
}

