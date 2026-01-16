'use client';

import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

type InsightStatus = 'positive' | 'negative' | 'warning';

interface Insight {
  text: string;
  status: InsightStatus;
}

interface InsightCardProps {
  title: string;
  subtitle?: string;
  insights: Insight[];
}

const statusConfig = {
  positive: {
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
    textColor: 'text-surface-700',
  },
  negative: {
    icon: XCircle,
    iconColor: 'text-red-500',
    textColor: 'text-surface-700',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    textColor: 'text-surface-700',
  },
};

export default function InsightCard({ title, subtitle, insights }: InsightCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-surface-900">{title}</h3>
        {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
      <ul className="space-y-3">
        {insights.map((insight, i) => {
          const config = statusConfig[insight.status];
          const Icon = config.icon;
          return (
            <li key={i} className="flex items-start gap-2">
              <Icon className={`w-4 h-4 ${config.iconColor} flex-shrink-0 mt-0.5`} />
              <span className={`text-sm ${config.textColor}`}>{insight.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
