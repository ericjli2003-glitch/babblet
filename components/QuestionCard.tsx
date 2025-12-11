'use client';

import { motion } from 'framer-motion';
import type { GeneratedQuestion } from '@/lib/types';
import { 
  MessageCircleQuestion, 
  Lightbulb, 
  Brain, 
  AlertTriangle,
  Expand 
} from 'lucide-react';

interface QuestionCardProps {
  question: GeneratedQuestion;
  index: number;
}

const typeConfig = {
  follow_up: {
    icon: MessageCircleQuestion,
    label: 'Follow-up',
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-200',
    iconBg: 'bg-gradient-to-br from-primary-400 to-primary-500',
  },
  clarifying: {
    icon: Lightbulb,
    label: 'Clarifying',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconBg: 'bg-gradient-to-br from-amber-400 to-amber-500',
  },
  critical_thinking: {
    icon: Brain,
    label: 'Critical Thinking',
    bgColor: 'bg-accent-50',
    borderColor: 'border-accent-200',
    iconBg: 'bg-gradient-to-br from-accent-400 to-accent-500',
  },
  misconception_check: {
    icon: AlertTriangle,
    label: 'Misconception Check',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    iconBg: 'bg-gradient-to-br from-rose-400 to-rose-500',
  },
  expansion: {
    icon: Expand,
    label: 'Expansion',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    iconBg: 'bg-gradient-to-br from-emerald-400 to-emerald-500',
  },
  summary: {
    icon: MessageCircleQuestion,
    label: 'Summary',
    bgColor: 'bg-surface-50',
    borderColor: 'border-surface-200',
    iconBg: 'bg-gradient-to-br from-surface-400 to-surface-500',
  },
};

const priorityBadge = {
  low: 'badge-easy',
  medium: 'badge-medium',
  high: 'badge-hard',
};

export default function QuestionCard({ question, index }: QuestionCardProps) {
  const config = typeConfig[question.type] || typeConfig.follow_up;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        delay: index * 0.1,
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      className={`question-card ${config.bgColor} border ${config.borderColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${config.iconBg}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-surface-500">
            {config.label}
          </span>
        </div>
        <span className={`badge ${priorityBadge[question.priority]}`}>
          {question.priority}
        </span>
      </div>
      
      {/* Question */}
      <p className="text-surface-800 font-medium text-base leading-relaxed mb-2">
        {question.question}
      </p>
      
      {/* Rationale */}
      {question.rationale && (
        <p className="text-surface-500 text-sm italic">
          {question.rationale}
        </p>
      )}
    </motion.div>
  );
}
