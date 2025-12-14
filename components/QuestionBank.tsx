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
} from 'lucide-react';
import type { GeneratedQuestion, QuestionCategory, QuestionDifficulty } from '@/lib/types';

interface QuestionBankProps {
  questions: {
    clarifying: GeneratedQuestion[];
    criticalThinking: GeneratedQuestion[];
    expansion: GeneratedQuestion[];
  };
  isLoading?: boolean;
  onSelectMarker?: (markerId: string) => void;
}

const categoryConfig: Record<
  QuestionCategory,
  { icon: typeof HelpCircle; label: string; color: string; bgColor: string }
> = {
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
  category: QuestionCategory;
  questions: GeneratedQuestion[];
  onSelectMarker?: (markerId: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const config = categoryConfig[category];
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

export default function QuestionBank({ questions, isLoading, onSelectMarker }: QuestionBankProps) {
  const totalQuestions =
    questions.clarifying.length +
    questions.criticalThinking.length +
    questions.expansion.length;

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
          <span className="text-sm text-surface-500">{totalQuestions} questions</span>
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
              Questions will appear here as the AI analyzes the presentation
            </p>
          </div>
        ) : (
          <>
            <CategorySection category="clarifying" questions={questions.clarifying} onSelectMarker={onSelectMarker} />
            <CategorySection category="critical-thinking" questions={questions.criticalThinking} onSelectMarker={onSelectMarker} />
            <CategorySection category="expansion" questions={questions.expansion} onSelectMarker={onSelectMarker} />
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

