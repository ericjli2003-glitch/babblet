'use client';

interface TranscriptSegmentProps {
  timestamp: string;
  label?: string;
  text: string;
  isCurrentSegment?: boolean;
  onClick?: () => void;
}

export default function TranscriptSegment({
  timestamp,
  label,
  text,
  isCurrentSegment = false,
  onClick,
}: TranscriptSegmentProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-colors ${
        isCurrentSegment
          ? 'bg-primary-50 border border-primary-200'
          : 'hover:bg-surface-50'
      }`}
    >
      <div className="flex gap-4">
        <span className="text-sm font-mono text-primary-600 flex-shrink-0 w-14">
          [{timestamp}]
        </span>
        <div className="flex-1">
          {label && (
            <div className="flex items-center gap-2 mb-2">
              {isCurrentSegment && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
              <span className={`text-xs font-semibold uppercase tracking-wide ${
                isCurrentSegment ? 'text-red-600' : 'text-surface-500'
              }`}>
                {isCurrentSegment ? 'Current Segment' : label}
              </span>
            </div>
          )}
          <p className={`text-sm leading-relaxed ${
            isCurrentSegment ? 'text-surface-800 font-medium' : 'text-surface-700'
          }`}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
