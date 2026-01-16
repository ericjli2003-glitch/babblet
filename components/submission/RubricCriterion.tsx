'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RubricCriterionProps {
  index: number;
  name: string;
  score: number;
  maxScore: number;
  scaleLabels?: [string, string, string];
  rationale?: string;
  onScoreChange?: (score: number) => void;
  onRationaleChange?: (rationale: string) => void;
}

export default function RubricCriterion({
  index,
  name,
  score,
  maxScore,
  scaleLabels = ['Poor', 'Average', 'Excellent'],
  rationale = '',
  onScoreChange,
  onRationaleChange,
}: RubricCriterionProps) {
  const [isExpanded, setIsExpanded] = useState(index === 0);
  const percentage = (score / maxScore) * 100;

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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
