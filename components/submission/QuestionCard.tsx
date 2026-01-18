'use client';

import { Check, MessageSquareQuote, Target, Lightbulb, Clock, PlayCircle } from 'lucide-react';

type QuestionCategory = 'basic' | 'intermediate' | 'advanced';

interface ContextReference {
  text: string;
  timestamps: string[];
  transcriptPreview?: string;
  rationale?: string;
  rubricCriterion?: string;
}

interface QuestionCardProps {
  category: QuestionCategory;
  question: string;
  context?: ContextReference;
  isSelected?: boolean;
  onToggle?: () => void;
  onTimestampClick?: (timestamp: string) => void;
}

const categoryConfig = {
  basic: {
    label: 'Basic Recall',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: MessageSquareQuote,
  },
  intermediate: {
    label: 'Intermediate Analysis',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Lightbulb,
  },
  advanced: {
    label: 'Advanced Synthesis',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    icon: Target,
  },
};

export default function QuestionCard({
  category,
  question,
  context,
  isSelected = false,
  onToggle,
  onTimestampClick,
}: QuestionCardProps) {
  const config = categoryConfig[category];

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${
      isSelected ? 'border-primary-300 shadow-md' : 'border-surface-200'
    }`}>
      {/* Category Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wide rounded-md border ${config.color}`}>
          {config.label}
        </span>
        {onToggle && (
          <button
            onClick={onToggle}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-surface-300 hover:border-primary-400'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Question */}
      <p className="text-surface-800 leading-relaxed mb-4">{question}</p>

      {/* Enhanced Context Section */}
      {context && (
        <div className="bg-surface-50 rounded-lg p-4 space-y-3">
          {/* Transcript Preview */}
          {context.transcriptPreview && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                <MessageSquareQuote className="w-4 h-4 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-600 mb-1">From Presentation</p>
                <p className="text-sm text-surface-700 italic leading-relaxed">
                  &ldquo;{context.transcriptPreview}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* Rationale */}
          {context.rationale && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-600 mb-1">Why This Question</p>
                <p className="text-sm text-surface-700 leading-relaxed">
                  {context.rationale}
                </p>
              </div>
            </div>
          )}

          {/* Rubric Criterion */}
          {context.rubricCriterion && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Target className="w-4 h-4 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-600 mb-1">Targets Criterion</p>
                <p className="text-sm text-surface-700 leading-relaxed">
                  {context.rubricCriterion}
                </p>
              </div>
            </div>
          )}

          {/* Timestamp Reference */}
          <div className="flex items-center gap-2 pt-2 border-t border-surface-200">
            <Clock className="w-3.5 h-3.5 text-surface-400" />
            <span className="text-xs text-surface-500">{context.text}</span>
            <div className="flex items-center gap-1">
              {context.timestamps.map((ts, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(ts)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium hover:bg-primary-200 transition-colors"
                >
                  <PlayCircle className="w-3 h-3" />
                  {ts}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
