'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Info, ChevronDown, ChevronUp, Sparkles, BookOpen, FileText, GitBranch, ExternalLink, Loader2, X, Wand2 } from 'lucide-react';

interface ContextReference {
  text: string;
  timestamps: string[];
}

interface MaterialReference {
  id: string;
  name: string;
  type: string;
  excerpt?: string;
  documentId?: string;
}

interface QuestionCardProps {
  category: string; // Accepts any category string - will use fallback styling for unknown categories
  question: string;
  context?: ContextReference;
  isSelected?: boolean;
  onToggle?: () => void;
  onTimestampClick?: (timestamp: string) => void;
  // New props for rationale display
  rationale?: string;
  rubricCriterion?: string;
  rubricJustification?: string;
  relevantSnippet?: string;
  // Course material references
  materialReferences?: MaterialReference[];
  onMaterialClick?: (ref: MaterialReference) => void;
  // Branch functionality
  onBranch?: (count: number, customization?: string) => void;
  isBranching?: boolean;
}

const categoryConfig: Record<string, { label: string; color: string; icon?: string }> = {
  // New comprehensive categories
  clarification: {
    label: 'Clarification',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: '❓',
  },
  evidence: {
    label: 'Evidence Request',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: '📊',
  },
  assumption: {
    label: 'Assumption Challenge',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: '🔍',
  },
  counterargument: {
    label: 'Counterargument',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: '⚔️',
  },
  application: {
    label: 'Application',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '🌍',
  },
  synthesis: {
    label: 'Synthesis',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    icon: '🔗',
  },
  evaluation: {
    label: 'Evaluation',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    icon: '⚖️',
  },
  methodology: {
    label: 'Methodology',
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    icon: '🔬',
  },
  limitation: {
    label: 'Limitation',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: '⚠️',
  },
  implication: {
    label: 'Implication',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    icon: '🚀',
  },
  // Legacy categories
  clarifying: {
    label: 'Clarifying',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: '❓',
  },
  'critical-thinking': {
    label: 'Critical Thinking',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: '🧠',
  },
  expansion: {
    label: 'Expansion',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '🌱',
  },
  // Difficulty-based (backwards compatibility)
  basic: {
    label: 'Basic Recall',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  intermediate: {
    label: 'Intermediate Analysis',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  advanced: {
    label: 'Advanced Synthesis',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
  },
};

export default function QuestionCard({
  category,
  question,
  context,
  isSelected = false,
  onToggle,
  onTimestampClick,
  rationale,
  rubricCriterion,
  rubricJustification,
  relevantSnippet,
  materialReferences,
  onMaterialClick,
  onBranch,
  isBranching = false,
}: QuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [branchCount, setBranchCount] = useState(1);
  const [branchCustomization, setBranchCustomization] = useState('');
  const branchPanelRef = useRef<HTMLDivElement>(null);
  
  // Reset branch panel when branching completes
  useEffect(() => {
    if (!isBranching && showBranchPanel) {
      // Keep panel open to show success, user can close manually
    }
  }, [isBranching, showBranchPanel]);

  const handleBranchSubmit = () => {
    if (onBranch) {
      onBranch(branchCount, branchCustomization.trim() || undefined);
      // Don't close panel - let it stay open while branching
    }
  };

  const closeBranchPanel = () => {
    setShowBranchPanel(false);
    setBranchCustomization('');
    setBranchCount(1);
  };
  
  // Get config with fallback for unknown categories
  const config = categoryConfig[category] || categoryConfig.clarification;
  
  const hasMaterialRefs = materialReferences && materialReferences.length > 0;

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${
      isSelected ? 'border-primary-300 shadow-md' : 'border-surface-200'
    }`}>
      {/* Category Badge, Branch Button & AI Rationale Available */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wide rounded-md border ${config.color}`}>
            {config.icon && <span className="mr-1">{config.icon}</span>}
            {config.label}
          </span>
          
          {/* Branch Button */}
          {onBranch && (
            <button
              onClick={() => setShowBranchPanel(!showBranchPanel)}
              disabled={isBranching}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                showBranchPanel
                  ? 'bg-primary-100 border-primary-300 text-primary-700'
                  : isBranching 
                    ? 'bg-primary-50 border-primary-200 text-primary-600 cursor-wait'
                    : 'bg-white border-surface-200 text-surface-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600'
              }`}
              title="Generate similar questions"
            >
              {isBranching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <GitBranch className="w-3.5 h-3.5" />
              )}
              <span>{isBranching ? 'Generating...' : 'Branch'}</span>
              {!isBranching && (showBranchPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
            </button>
          )}
          
        </div>
        <div className="flex items-center gap-2">
          {onToggle && (
            <button
              onClick={onToggle}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-surface-300 hover:border-primary-400'
              }`}
            >
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Branch Panel - Expandable pill below header */}
      {showBranchPanel && onBranch && (
        <div 
          ref={branchPanelRef}
          className="mb-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-xl animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-semibold text-primary-900">Generate Similar Questions</span>
            </div>
            <button
              onClick={closeBranchPanel}
              className="p-1 text-surface-400 hover:text-surface-600 hover:bg-white/50 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Customization Input */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-surface-600 mb-1.5">
              What would you like to change? <span className="text-surface-400">(optional)</span>
            </label>
            <input
              type="text"
              value={branchCustomization}
              onChange={(e) => setBranchCustomization(e.target.value)}
              placeholder="e.g., Make it harder, Focus on methodology, Add real-world context..."
              className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={isBranching}
            />
          </div>
          
          {/* Count Selector & Generate Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-surface-600">How many?</span>
              <div className="flex items-center bg-white border border-surface-200 rounded-lg overflow-hidden">
                {[1, 2, 3].map((count) => (
                  <button
                    key={count}
                    onClick={() => setBranchCount(count)}
                    disabled={isBranching}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      branchCount === count
                        ? 'bg-primary-500 text-white'
                        : 'text-surface-600 hover:bg-surface-50'
                    } ${count !== 3 ? 'border-r border-surface-200' : ''}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleBranchSubmit}
              disabled={isBranching}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isBranching
                  ? 'bg-primary-400 text-white cursor-wait'
                  : 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm'
              }`}
            >
              {isBranching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate {branchCount} {branchCount === 1 ? 'Question' : 'Questions'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Question with inline material references */}
      <p className="text-surface-800 leading-relaxed mb-3">
        {question}
        {hasMaterialRefs && (
          <span className="ml-1">
            {materialReferences.map((ref, i) => (
              <button
                key={ref.id}
                onClick={() => onMaterialClick?.(ref)}
                className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium text-sm hover:underline"
                title={`View: ${ref.name}`}
              >
                [{i + 1}]
              </button>
            ))}
          </span>
        )}
      </p>
      
      {/* Course Material References Section */}
      {hasMaterialRefs && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Course Material References</span>
          </div>
          <div className="space-y-1.5">
            {materialReferences.map((ref, i) => (
              <button
                key={ref.id}
                onClick={() => onMaterialClick?.(ref)}
                className="flex items-start gap-2 w-full text-left group"
              >
                <span className="text-xs font-bold text-blue-600 mt-0.5">[{i + 1}]</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-blue-800 group-hover:underline truncate">
                      {ref.name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded capitalize">
                      {ref.type}
                    </span>
                    <ExternalLink className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {ref.excerpt && (
                    <p className="text-xs text-blue-600 mt-0.5 line-clamp-1">&quot;{ref.excerpt}&quot;</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Context Line - shows timestamp reference */}
      {context && context.timestamps.length > 0 && (
        <div className="flex items-start gap-2 pt-3 border-t border-surface-100">
          <Info className="w-3.5 h-3.5 text-primary-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-surface-500">
            <span className="text-primary-600 font-medium">Context:</span>{' '}
            {context.text}{' '}
            {context.timestamps.map((ts, i) => (
              <span key={i}>
                <button 
                  onClick={() => onTimestampClick?.(ts)}
                  className="text-primary-600 hover:text-primary-700 hover:underline font-medium"
                >
                  [{ts}]
                </button>
                {i < context.timestamps.length - 1 && ' and '}
              </span>
            ))}.
          </p>
        </div>
      )}
    </div>
  );
}
