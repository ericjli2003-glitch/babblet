'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { GeneratedQuestion, QuestionType } from '@/lib/types';
import QuestionCard from './QuestionCard';

interface QuestionsPanelProps {
  questions: GeneratedQuestion[];
}

const filterOptions: { value: QuestionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Questions' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'clarifying', label: 'Clarifying' },
  { value: 'critical_thinking', label: 'Critical Thinking' },
  { value: 'misconception_check', label: 'Misconception' },
  { value: 'expansion', label: 'Expansion' },
];

export default function QuestionsPanel({ questions }: QuestionsPanelProps) {
  const [filter, setFilter] = useState<QuestionType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priority'>('time');

  const filteredQuestions = questions
    .filter(q => filter === 'all' || q.type === filter)
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.timestamp - a.timestamp;
    });

  return (
    <div className="card-neumorphic overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-surface-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-surface-900">
            Generated Questions
            <span className="ml-2 px-2 py-0.5 bg-gradient-subtle text-primary-600 text-sm rounded-full">
              {questions.length}
            </span>
          </h3>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'time' | 'priority')}
            className="input-field !w-auto !py-1.5 !px-3 text-sm"
          >
            <option value="time">Newest First</option>
            <option value="priority">By Priority</option>
          </select>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1 text-sm rounded-full transition-all ${
                filter === option.value
                  ? 'bg-gradient-primary text-white shadow-soft'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {filteredQuestions.length === 0 ? (
          <div className="text-center text-surface-400 py-8">
            <p className="text-lg">No questions yet</p>
            <p className="text-sm mt-1">Questions will appear as the presentation progresses</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredQuestions.map((question, idx) => (
              <QuestionCard 
                key={question.id} 
                question={question} 
                index={idx}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
