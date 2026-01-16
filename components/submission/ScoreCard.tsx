'use client';

import { ReactNode } from 'react';

interface ScoreCardProps {
  score: number;
  maxScore?: number;
  performanceLabel: string;
  percentileBadge?: string;
  summary: string;
  badges?: Array<{
    label: string;
    icon?: ReactNode;
  }>;
}

export default function ScoreCard({
  score,
  maxScore = 100,
  performanceLabel,
  percentileBadge,
  summary,
  badges = [],
}: ScoreCardProps) {
  const percentage = (score / maxScore) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-6">
      <div className="flex gap-6">
        {/* Circular Score */}
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="10"
            />
            {/* Progress circle */}
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-surface-900">{score}</span>
            <span className="text-xs text-surface-500">SCORE</span>
          </div>
        </div>

        {/* Performance Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-semibold text-surface-900">{performanceLabel}</h3>
            {percentileBadge && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                {percentileBadge}
              </span>
            )}
          </div>
          <p className="text-sm text-surface-600 leading-relaxed">{summary}</p>
          
          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              {badges.map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-100 text-surface-600 text-xs font-medium rounded-full"
                >
                  {badge.icon}
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
