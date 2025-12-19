'use client';

import { motion } from 'framer-motion';
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  BookOpen,
  Mic2,
  FileCheck,
  ChevronRight,
} from 'lucide-react';
import type { RubricEvaluation, RubricScore } from '@/lib/types';

interface RubricCardProps {
  rubric: RubricEvaluation | null;
  isLoading?: boolean;
}

function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= score
              ? 'text-amber-400 fill-amber-400'
              : 'text-surface-300'
            }`}
        />
      ))}
    </div>
  );
}

function ScoreCategory({
  title,
  icon: Icon,
  score,
  delay = 0,
}: {
  title: string;
  icon: typeof BookOpen;
  score: RubricScore;
  delay?: number;
}) {
  const getScoreColor = (value: number) => {
    if (value >= 4) return 'text-emerald-600';
    if (value >= 3) return 'text-amber-600';
    return 'text-red-600';
  };

  const getTrend = (value: number) => {
    if (value >= 4) return { icon: TrendingUp, color: 'text-emerald-500' };
    if (value >= 3) return { icon: Minus, color: 'text-amber-500' };
    return { icon: TrendingDown, color: 'text-red-500' };
  };

  const trend = getTrend(score.score);
  const TrendIcon = trend.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="p-4 rounded-2xl bg-white border border-surface-100 shadow-soft hover:shadow-soft-lg transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-subtle flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h4 className="font-medium text-surface-800">{title}</h4>
            <ScoreStars score={score.score} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-2xl font-bold ${getScoreColor(score.score)}`}>
            {score.score}
          </span>
          <span className="text-surface-400">/5</span>
          <TrendIcon className={`w-4 h-4 ml-1 ${trend.color}`} />
        </div>
      </div>

      <p className="text-sm text-surface-600 mb-4">{score.feedback}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-emerald-600 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            Strengths
          </p>
          <ul className="space-y-1">
            {score.strengths.slice(0, 2).map((strength, i) => (
              <li key={i} className="text-xs text-surface-600 pl-3">
                {strength}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-600 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            Improvements
          </p>
          <ul className="space-y-1">
            {score.improvements.slice(0, 2).map((improvement, i) => (
              <li key={i} className="text-xs text-surface-600 pl-3">
                {improvement}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function OverallScore({ score, feedback }: { score: number; feedback: string }) {
  const circumference = 2 * Math.PI * 45;
  const progress = (score / 5) * circumference;

  const getGradeColor = (value: number) => {
    if (value >= 4.5) return { bg: 'from-emerald-500 to-emerald-600', text: 'text-emerald-600' };
    if (value >= 3.5) return { bg: 'from-lime-500 to-emerald-500', text: 'text-lime-600' };
    if (value >= 2.5) return { bg: 'from-amber-500 to-lime-500', text: 'text-amber-600' };
    return { bg: 'from-red-500 to-amber-500', text: 'text-red-600' };
  };

  const gradeColors = getGradeColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative p-6 rounded-3xl bg-gradient-to-br from-surface-50 to-white border border-surface-200"
    >
      <div className="flex items-center gap-6">
        {/* Circular progress */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="45"
              className="fill-none stroke-surface-200"
              strokeWidth="8"
            />
            <motion.circle
              cx="56"
              cy="56"
              r="45"
              className={`fill-none stroke-current bg-gradient-to-r ${gradeColors.bg}`}
              style={{ stroke: 'url(#gradient)' }}
              strokeWidth="8"
              strokeLinecap="round"
              initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - progress }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5B7CFF" />
                <stop offset="100%" stopColor="#A66BFF" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${gradeColors.text}`}>
              {score.toFixed(1)}
            </span>
            <span className="text-xs text-surface-500">out of 5</span>
          </div>
        </div>

        {/* Feedback */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-surface-900">Overall Evaluation</h3>
          </div>
          <p className="text-sm text-surface-600 leading-relaxed">{feedback}</p>
        </div>
      </div>
    </motion.div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-surface-200 rounded-3xl" />
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-surface-200 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function RubricCard({ rubric, isLoading }: RubricCardProps) {
  if (isLoading) {
    return (
      <div className="h-full p-4">
        <LoadingPlaceholder />
      </div>
    );
  }

  if (!rubric) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-surface-400 p-8">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <Award className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm text-center">
          Rubric evaluation will be generated when the presentation ends
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-200">
        <h3 className="font-semibold text-surface-900">Rubric Evaluation</h3>
        <p className="text-xs text-surface-500 mt-0.5">
          Comprehensive assessment of the presentation
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        <OverallScore score={rubric.overallScore} feedback={rubric.overallFeedback} />

        <ScoreCategory
          title="Content Quality"
          icon={BookOpen}
          score={rubric.contentQuality}
          delay={0.1}
        />

        <ScoreCategory
          title="Delivery"
          icon={Mic2}
          score={rubric.delivery}
          delay={0.2}
        />

        <ScoreCategory
          title="Evidence Strength"
          icon={FileCheck}
          score={rubric.evidenceStrength}
          delay={0.3}
        />

        {rubric.criteriaBreakdown && rubric.criteriaBreakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="p-4 rounded-2xl bg-white border border-surface-100 shadow-soft"
          >
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="w-5 h-5 text-primary-600" />
              <h4 className="font-medium text-surface-800">Criteria Breakdown</h4>
              <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
                {rubric.criteriaBreakdown.length}
              </span>
            </div>

            <div className="space-y-3">
              {rubric.criteriaBreakdown.slice(0, 8).map((c, idx) => (
                <div key={`${c.criterion}-${idx}`} className="p-3 rounded-xl bg-surface-50 border border-surface-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-surface-800">{c.criterion}</p>
                      <div className="mt-1">
                        <ScoreStars score={Math.round(c.score)} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-lg font-bold text-surface-800">{c.score}</span>
                      <span className="text-surface-400">/5</span>
                    </div>
                  </div>

                  {c.feedback && (
                    <p className="mt-2 text-xs text-surface-600 leading-relaxed">
                      {c.feedback}
                    </p>
                  )}

                  {c.missingEvidence && c.missingEvidence.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />
                        Missing evidence (mapped to rubric)
                      </p>
                      <ul className="mt-1 space-y-1">
                        {c.missingEvidence.slice(0, 3).map((e, i) => (
                          <li key={i} className="text-xs text-surface-600 pl-3">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-100 bg-surface-50/50">
        <p className="text-xs text-surface-500 text-center">
          Generated at {new Date(rubric.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

