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
    color: 'from-blue-500 to-cyan-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  clarifying: {
    icon: Lightbulb,
    label: 'Clarifying',
    color: 'from-amber-500 to-yellow-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  critical_thinking: {
    icon: Brain,
    label: 'Critical Thinking',
    color: 'from-purple-500 to-pink-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  misconception_check: {
    icon: AlertTriangle,
    label: 'Misconception Check',
    color: 'from-red-500 to-orange-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  expansion: {
    icon: Expand,
    label: 'Expansion',
    color: 'from-green-500 to-emerald-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  summary: {
    icon: MessageCircleQuestion,
    label: 'Summary',
    color: 'from-slate-500 to-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
  },
};

const priorityBadge = {
  low: 'bg-slate-600/50 text-slate-300',
  medium: 'bg-amber-600/50 text-amber-200',
  high: 'bg-red-600/50 text-red-200',
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
      className={`relative p-4 rounded-xl border ${config.bgColor} ${config.borderColor} 
        backdrop-blur-sm hover:scale-[1.02] transition-transform cursor-pointer group`}
    >
      {/* Glow effect */}
      <div 
        className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 
          transition-opacity bg-gradient-to-br ${config.color} blur-xl -z-10`}
        style={{ transform: 'scale(0.9)' }}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-gradient-to-br ${config.color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {config.label}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge[question.priority]}`}>
          {question.priority}
        </span>
      </div>
      
      {/* Question */}
      <p className="text-white font-medium text-base leading-relaxed mb-2">
        {question.question}
      </p>
      
      {/* Rationale */}
      {question.rationale && (
        <p className="text-white/50 text-sm italic">
          {question.rationale}
        </p>
      )}
    </motion.div>
  );
}

