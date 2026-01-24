'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { useHighlightContext } from '@/lib/hooks/useHighlightContext';

export default function FloatingActionPill() {
  const { 
    currentHighlight, 
    isHighlighting, 
    isChatOpen,
    openChat, 
    setHighlight 
  } = useHighlightContext();
  
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // Update position when highlight changes
  useEffect(() => {
    if (currentHighlight?.position) {
      setPosition({
        x: Math.min(currentHighlight.position.x, window.innerWidth - 150),
        y: Math.max(currentHighlight.position.y, 50),
      });
    }
  }, [currentHighlight?.position]);
  
  // Hide pill when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-highlight-pill]') && !target.closest('[data-chat-panel]')) {
        // Don't clear if chat is open
        if (!isChatOpen) {
          setHighlight(null);
        }
      }
    };
    
    // Delay to avoid immediate dismissal
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [setHighlight, isChatOpen]);
  
  const handleAskClick = () => {
    openChat();
  };
  
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHighlight(null);
  };
  
  // Don't show if chat is already open or no highlight
  if (!isHighlighting || !currentHighlight || isChatOpen) {
    return null;
  }
  
  return (
    <AnimatePresence>
      <motion.div
        data-highlight-pill
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        className="fixed z-50 flex items-center gap-1"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <button
          onClick={handleAskClick}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 text-white text-sm font-medium rounded-full shadow-lg hover:bg-primary-600 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Ask about this
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 bg-surface-100 hover:bg-surface-200 text-surface-500 rounded-full shadow-lg transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
