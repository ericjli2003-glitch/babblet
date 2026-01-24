'use client';

import { ReactNode, useCallback } from 'react';
import { useTextSelection, HighlightSourceType, HighlightMetadata } from '@/lib/hooks/useHighlightContext';

interface HighlightableContentProps {
  children: ReactNode;
  sourceType: HighlightSourceType;
  sourceId?: string;
  timestamp?: string;
  criterionId?: string;
  rubricCriterion?: string;
  className?: string;
}

/**
 * Wrapper component that enables text selection and AI chat for its children
 * Wrap any content that should support the "Ask about this" feature
 */
export default function HighlightableContent({
  children,
  sourceType,
  sourceId,
  timestamp,
  criterionId,
  rubricCriterion,
  className = '',
}: HighlightableContentProps) {
  const additionalMeta: Partial<HighlightMetadata> = {
    timestamp,
    criterionId,
    rubricCriterion,
  };
  
  const { handleMouseUp, isSelected } = useTextSelection(sourceType, sourceId, additionalMeta);
  
  return (
    <div
      onMouseUp={handleMouseUp}
      className={`${className} ${isSelected ? 'ring-2 ring-primary-200 ring-offset-2 rounded' : ''}`}
    >
      {children}
    </div>
  );
}
