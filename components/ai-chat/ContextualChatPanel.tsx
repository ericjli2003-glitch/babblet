'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Send, Loader2, Lightbulb, MessageSquare, 
  RotateCcw, Sparkles, FileText, Mic, BookOpen, AlertCircle, ExternalLink
} from 'lucide-react';
import { useHighlightContext, HighlightSourceType } from '@/lib/hooks/useHighlightContext';

// Source type icons and labels
const SOURCE_CONFIG: Record<HighlightSourceType, { icon: React.ReactNode; label: string; color: string }> = {
  question: { icon: <MessageSquare className="w-3 h-3" />, label: 'Question', color: 'text-purple-600 bg-purple-50' },
  transcript: { icon: <Mic className="w-3 h-3" />, label: 'Transcript', color: 'text-blue-600 bg-blue-50' },
  rubric: { icon: <BookOpen className="w-3 h-3" />, label: 'Rubric', color: 'text-emerald-600 bg-emerald-50' },
  summary: { icon: <FileText className="w-3 h-3" />, label: 'Summary', color: 'text-amber-600 bg-amber-50' },
  other: { icon: <FileText className="w-3 h-3" />, label: 'Content', color: 'text-surface-600 bg-surface-50' },
};

export default function ContextualChatPanel() {
  const {
    currentHighlight,
    isChatOpen,
    chatMessages,
    isLoading,
    closeChat,
    clearHighlightContext,
    sendMessage,
    cancelRequest,
  } = useHighlightContext();
  
  const [inputValue, setInputValue] = useState('');
  const [showSwitchPrompt, setShowSwitchPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Focus input when chat opens
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isChatOpen]);
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  }, [inputValue, isLoading, sendMessage]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  const handleClearContext = () => {
    clearHighlightContext();
  };
  
  if (!isChatOpen) return null;
  
  const sourceConfig = currentHighlight?.sourceType 
    ? SOURCE_CONFIG[currentHighlight.sourceType] 
    : SOURCE_CONFIG.other;
  
  return (
    <AnimatePresence>
      <motion.div
        data-chat-panel
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed right-4 bottom-4 w-96 max-h-[600px] bg-white rounded-2xl shadow-2xl border border-surface-200 flex flex-col overflow-hidden z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-900">Babblet Assistant</h3>
              <p className="text-xs text-surface-500">Ask anything about this selection</p>
            </div>
          </div>
          <button
            onClick={closeChat}
            className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Context Badge */}
        {currentHighlight && (
          <div className="px-4 py-2 bg-surface-50 border-b border-surface-100">
            <div className="flex items-start gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sourceConfig.color}`}>
                {sourceConfig.icon}
                {sourceConfig.label}
              </span>
              <p className="text-xs text-surface-600 line-clamp-2 flex-1">
                "{currentHighlight.text.slice(0, 100)}{currentHighlight.text.length > 100 ? '...' : ''}"
              </p>
            </div>
            <button
              onClick={handleClearContext}
              className="mt-2 text-xs text-surface-400 hover:text-surface-600 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Clear highlight context
            </button>
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[350px]">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6 text-primary-400" />
              </div>
              <p className="text-sm text-surface-500 mb-2">
                Ask me anything about the highlighted text
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'Explain this',
                  'Why is this important?',
                  'How could this be improved?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInputValue(suggestion)}
                    className="px-3 py-1.5 text-xs text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-full transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {chatMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  message.role === 'user'
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-100 text-surface-900'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                
                {/* Material References Section */}
                {message.materialReferences && message.materialReferences.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-surface-200/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-medium text-blue-700">Course Material References</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {message.materialReferences.map((ref, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100"
                          title={`Referenced from: ${ref.name}`}
                        >
                          <span className="font-bold">[{ref.index}]</span>
                          <span className="truncate max-w-[120px]">{ref.name}</span>
                          <span className="text-blue-400 capitalize text-[10px]">({ref.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Recommendations Section */}
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-surface-200/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-medium text-amber-700">Recommendations</span>
                    </div>
                    <ul className="space-y-1.5">
                      {message.recommendations.slice(0, 3).map((rec, i) => (
                        <li key={i} className="text-xs text-surface-600 flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-surface-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                <span className="text-sm text-surface-500">Thinking...</span>
                <button
                  onClick={cancelRequest}
                  className="ml-2 text-xs text-surface-400 hover:text-surface-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-surface-200">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="flex-1 px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-surface-400 text-center">
            Press Enter to send • Unlimited follow-ups
          </p>
        </form>
      </motion.div>
    </AnimatePresence>
  );
}
