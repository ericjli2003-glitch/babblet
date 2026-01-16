'use client';

interface VerificationMetric {
  label: string;
  sublabel?: string;
  value: number;
  maxValue?: number;
  status: 'high' | 'medium' | 'low';
}

interface VerificationCardProps {
  title: string;
  subtitle?: string;
  metrics: VerificationMetric[];
}

const statusColors = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

const statusLabels = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const statusTextColors = {
  high: 'text-emerald-600',
  medium: 'text-amber-600',
  low: 'text-red-600',
};

export default function VerificationCard({ title, subtitle, metrics }: VerificationCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-surface-900">{title}</h3>
        {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-4">
        {metrics.map((metric, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-sm text-surface-700">{metric.label}</span>
                {metric.sublabel && (
                  <span className="text-xs text-surface-400 ml-1">{metric.sublabel}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-surface-900">
                  {metric.value}%
                </span>
                <span className={`text-xs font-medium ${statusTextColors[metric.status]}`}>
                  {statusLabels[metric.status]}
                </span>
              </div>
            </div>
            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${statusColors[metric.status]} transition-all duration-500`}
                style={{ width: `${metric.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
