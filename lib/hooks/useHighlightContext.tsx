'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export type HighlightSourceType = 'question' | 'transcript' | 'rubric' | 'summary' | 'other';

export interface HighlightMetadata {
  text: string;
  sourceType: HighlightSourceType;
  sourceId?: string; // question ID, segment ID, criterion ID
  timestamp?: string; // for transcript segments
  criterionId?: string; // for rubric
  rubricCriterion?: string; // criterion name
  assignmentId?: string;
  learningObjective?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: string[];
  timestamp: number;
}

interface HighlightContextState {
  // Highlight state
  currentHighlight: HighlightMetadata | null;
  isHighlighting: boolean;
  
  // Chat state
  isChatOpen: boolean;
  chatMessages: ChatMessage[];
  isLoading: boolean;
  
  // Context
  assignmentId?: string;
  submissionId?: string;
  learningObjective?: string;
  
  // Actions
  setHighlight: (highlight: HighlightMetadata | null) => void;
  openChat: () => void;
  closeChat: () => void;
  clearHighlightContext: () => void;
  sendMessage: (message: string) => Promise<void>;
  switchHighlight: (newHighlight: HighlightMetadata) => void;
  setAssignmentContext: (assignmentId: string, submissionId: string, learningObjective?: string) => void;
  cancelRequest: () => void;
}

// ============================================
// Context
// ============================================

const HighlightContext = createContext<HighlightContextState | null>(null);

export function useHighlightContext() {
  const context = useContext(HighlightContext);
  if (!context) {
    throw new Error('useHighlightContext must be used within a HighlightContextProvider');
  }
  return context;
}

// ============================================
// Provider
// ============================================

interface HighlightContextProviderProps {
  children: ReactNode;
}

export function HighlightContextProvider({ children }: HighlightContextProviderProps) {
  // Highlight state
  const [currentHighlight, setCurrentHighlight] = useState<HighlightMetadata | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Context
  const [assignmentId, setAssignmentId] = useState<string>();
  const [submissionId, setSubmissionId] = useState<string>();
  const [learningObjective, setLearningObjective] = useState<string>();
  
  // Abort controller for cancellable requests
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Set highlight
  const setHighlight = useCallback((highlight: HighlightMetadata | null) => {
    setCurrentHighlight(highlight);
    setIsHighlighting(!!highlight);
  }, []);
  
  // Open chat
  const openChat = useCallback(() => {
    setIsChatOpen(true);
  }, []);
  
  // Close chat
  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);
  
  // Clear highlight context
  const clearHighlightContext = useCallback(() => {
    setCurrentHighlight(null);
    setIsHighlighting(false);
    setChatMessages([]);
  }, []);
  
  // Switch to new highlight
  const switchHighlight = useCallback((newHighlight: HighlightMetadata) => {
    setCurrentHighlight(newHighlight);
    setChatMessages([]); // Clear previous conversation
  }, []);
  
  // Set assignment context
  const setAssignmentContext = useCallback((
    newAssignmentId: string, 
    newSubmissionId: string, 
    newLearningObjective?: string
  ) => {
    setAssignmentId(newAssignmentId);
    setSubmissionId(newSubmissionId);
    setLearningObjective(newLearningObjective);
  }, []);
  
  // Cancel ongoing request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);
  
  // Send message to AI
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;
    
    // Cancel any ongoing request
    cancelRequest();
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/contextual-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            highlightedText: currentHighlight?.text,
            sourceType: currentHighlight?.sourceType,
            sourceId: currentHighlight?.sourceId,
            timestamp: currentHighlight?.timestamp,
            criterionId: currentHighlight?.criterionId,
            rubricCriterion: currentHighlight?.rubricCriterion,
            assignmentId,
            submissionId,
            learningObjective,
          },
          conversationHistory: chatMessages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });
      
      const data = await response.json();
      
      if (data.success) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          recommendations: data.recommendations,
          timestamp: Date.now(),
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      } else {
        // Add error message
        const errorMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Request was cancelled, don't add error message
        return;
      }
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    currentHighlight, 
    assignmentId, 
    submissionId, 
    learningObjective, 
    chatMessages, 
    isLoading,
    cancelRequest,
  ]);
  
  const value: HighlightContextState = {
    currentHighlight,
    isHighlighting,
    isChatOpen,
    chatMessages,
    isLoading,
    assignmentId,
    submissionId,
    learningObjective,
    setHighlight,
    openChat,
    closeChat,
    clearHighlightContext,
    sendMessage,
    switchHighlight,
    setAssignmentContext,
    cancelRequest,
  };
  
  return (
    <HighlightContext.Provider value={value}>
      {children}
    </HighlightContext.Provider>
  );
}

// ============================================
// Hook for text selection detection
// ============================================

export function useTextSelection(
  sourceType: HighlightSourceType,
  sourceId?: string,
  additionalMeta?: Partial<HighlightMetadata>
) {
  const { setHighlight, currentHighlight, isChatOpen } = useHighlightContext();
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 3) {
      // Get position for the floating pill
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      
      if (rect) {
        setHighlight({
          text: selectedText,
          sourceType,
          sourceId,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          },
          ...additionalMeta,
        });
      }
    }
  }, [setHighlight, sourceType, sourceId, additionalMeta]);
  
  const clearSelection = useCallback(() => {
    if (!isChatOpen) {
      setHighlight(null);
    }
  }, [setHighlight, isChatOpen]);
  
  return {
    handleMouseUp,
    clearSelection,
    isSelected: currentHighlight?.sourceId === sourceId && currentHighlight?.sourceType === sourceType,
  };
}
