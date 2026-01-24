'use client';

export { default as FloatingActionPill } from './FloatingActionPill';
export { default as ContextualChatPanel } from './ContextualChatPanel';
export { default as HighlightableContent } from './HighlightableContent';

// Re-export hooks
export { 
  HighlightContextProvider, 
  useHighlightContext, 
  useTextSelection 
} from '@/lib/hooks/useHighlightContext';
export type { 
  HighlightSourceType, 
  HighlightMetadata, 
  ChatMessage 
} from '@/lib/hooks/useHighlightContext';
