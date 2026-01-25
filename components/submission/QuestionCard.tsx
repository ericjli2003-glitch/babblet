'use client';

import { Check, Info } from 'lucide-react';

interface ContextReference {
  text: string;
  timestamps: string[];
}

interface QuestionCardProps {
  category: string; // Accepts any category string - will use fallback styling for unknown categories
  question: string;
  context?: ContextReference;
  isSelected?: boolean;
  onToggle?: () => void;
  onTimestampClick?: (timestamp: string) => void;
}

const categoryConfig: Record<string, { label: string; color: string; icon?: string }> = {
  // New comprehensive categories
  clarification: {
    label: 'Clarification',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: '❓',
  },
  evidence: {
    label: 'Evidence Request',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: '📊',
  },
  assumption: {
    label: 'Assumption Challenge',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: '🔍',
  },
  counterargument: {
    label: 'Counterargument',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: '⚔️',
  },
  application: {
    label: 'Application',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '🌍',
  },
  synthesis: {
    label: 'Synthesis',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    icon: '🔗',
  },
  evaluation: {
    label: 'Evaluation',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    icon: '⚖️',
  },
  methodology: {
    label: 'Methodology',
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    icon: '🔬',
  },
  limitation: {
    label: 'Limitation',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: '⚠️',
  },
  implication: {
    label: 'Implication',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    icon: '🚀',
  },
  // Legacy categories
  clarifying: {
    label: 'Clarifying',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: '❓',
  },
  'critical-thinking': {
    label: 'Critical Thinking',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: '🧠',
  },
  expansion: {
    label: 'Expansion',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '🌱',
  },
  // Difficulty-based (backwards compatibility)
  basic: {
    label: 'Basic Recall',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  intermediate: {
    label: 'Intermediate Analysis',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  advanced: {
    label: 'Advanced Synthesis',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
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
  // Get config with fallback for unknown categories
  const config = categoryConfig[category] || categoryConfig.clarification;

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${
      isSelected ? 'border-primary-300 shadow-md' : 'border-surface-200'
    }`}>
      {/* Category Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wide rounded-md border ${config.color}`}>
          {config.icon && <span className="mr-1">{config.icon}</span>}
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
      <p className="text-surface-800 leading-relaxed mb-3">{question}</p>

      {/* Simple Context Line */}
      {context && (
        <div className="flex items-start gap-2 pt-3 border-t border-surface-100">
          <Info className="w-3.5 h-3.5 text-primary-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-surface-500">
            <span className="text-primary-600 font-medium">Context:</span>{' '}
            {context.text}{' '}
            {context.timestamps.map((ts, i) => (
              <span key={i}>
                <button 
                  onClick={() => onTimestampClick?.(ts)}
                  className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                >
                  [{ts}]
                </button>
                {i < context.timestamps.length - 1 && ' and '}
              </span>
            ))}.
          </p>
        </div>
      )}
    </div>
  );
}
