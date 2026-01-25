'use client';

import { ReactNode, useCallback, useRef } from 'react';
import { useHighlightContext, HighlightSourceType, HighlightMetadata } from '@/lib/hooks/useHighlightContext';

interface HighlightableContentProps {
  children: ReactNode;
  sourceType: HighlightSourceType;
  sourceId?: string;
  timestamp?: string;
  criterionId?: string;
  rubricCriterion?: string;
  fullContext?: string; // Optional: provide full context explicitly
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
  fullContext,
  className = '',
}: HighlightableContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setHighlight, currentHighlight, isChatOpen } = useHighlightContext();
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 3) {
      // Get position for the floating pill
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      
      if (rect) {
        // Get the container's full text as context
        const containerText = fullContext || containerRef.current?.textContent || '';
        
        setHighlight({
          text: selectedText,
          fullContext: containerText !== selectedText ? containerText : undefined,
          sourceType,
          sourceId,
          timestamp,
          criterionId,
          rubricCriterion,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          },
        });
      }
    }
  }, [setHighlight, sourceType, sourceId, timestamp, criterionId, rubricCriterion, fullContext]);
  
  const isSelected = currentHighlight?.sourceId === sourceId && currentHighlight?.sourceType === sourceType;
  
  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`${className} ${isSelected ? 'ring-2 ring-primary-200 ring-offset-2 rounded' : ''}`}
    >
      {children}
    </div>
  );
}
