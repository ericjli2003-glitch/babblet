'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  AlertTriangle,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react';
import type { AnalysisSummary, KeyClaim, LogicalGap, MissingEvidence } from '@/lib/types';

interface SummaryCardProps {
  analysis: AnalysisSummary | null;
  isLoading?: boolean;
  onSelectMarker?: (markerId: string) => void;
}

function ClaimItem({ claim, index, onSelect }: { claim: KeyClaim; index: number; onSelect?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="p-3 rounded-xl bg-white border border-surface-100 shadow-soft cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-primary text-white text-xs flex items-center justify-center font-medium">
          {index + 1}
        </div>
        <div className="flex-1">
          <p className="text-sm text-surface-800 font-medium">{claim.claim}</p>

          {claim.evidence.length > 0 && (
            <>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {claim.evidence.length} supporting evidence
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-1 overflow-hidden"
                  >
                    {claim.evidence.map((evidence, i) => (
                      <li key={i} className="text-xs text-surface-600 pl-4 border-l-2 border-primary-200">
                        {evidence}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {claim.confidence && (
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-surface-400">
              <TrendingUp className="w-3 h-3" />
              <span>{Math.round(claim.confidence * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GapItem({ gap, index, onSelect }: { gap: LogicalGap; index: number; onSelect?: () => void }) {
  const severityColors = {
    minor: 'bg-amber-100 text-amber-700 border-amber-200',
    moderate: 'bg-orange-100 text-orange-700 border-orange-200',
    major: 'bg-red-100 text-red-700 border-red-200',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`p-3 rounded-xl border cursor-pointer hover:shadow-md transition-all ${severityColors[gap.severity]}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium">{gap.description}</p>
          {gap.suggestion && (
            <p className="text-xs mt-1 opacity-80">
              <Zap className="w-3 h-3 inline mr-1" />
              {gap.suggestion}
            </p>
          )}
        </div>
        <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-white/50">
          {gap.severity}
        </span>
      </div>
    </motion.div>
  );
}

function MissingEvidenceItem({ item, index, onSelect }: { item: MissingEvidence; index: number; onSelect?: () => void }) {
  const importanceColors = {
    low: 'text-surface-500',
    medium: 'text-amber-600',
    high: 'text-red-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex items-start gap-2 p-2 cursor-pointer hover:bg-surface-50 rounded-lg transition-all"
      onClick={onSelect}
    >
      <FileQuestion className={`w-4 h-4 flex-shrink-0 ${importanceColors[item.importance]}`} />
      <div>
        <p className="text-sm text-surface-700">{item.description}</p>
        <p className="text-xs text-surface-400 mt-0.5">
          Related to: {item.relatedClaim}
        </p>
      </div>
    </motion.div>
  );
}

function StrengthMeter({ value }: { value: number }) {
  const percentage = (value / 5) * 100;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
  const color = colors[Math.min(Math.floor(value) - 1, 4)] || 'bg-surface-300';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-surface-200 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-lg font-semibold text-surface-800">{value.toFixed(1)}/5</span>
    </div>
  );
}

export default function SummaryCard({ analysis, isLoading, onSelectMarker }: SummaryCardProps) {
  const [activeSection, setActiveSection] = useState<'claims' | 'gaps' | 'evidence'>('claims');

  if (!analysis && !isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-surface-400 p-8">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <Target className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm text-center">
          Analysis will appear here as the presentation progresses
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with strength meter */}
      <div className="px-4 py-3 border-b border-surface-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-surface-900">Analysis Summary</h3>
          {isLoading && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary-50 text-primary-600 rounded-full text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
              <span>Analyzing...</span>
            </div>
          )}
        </div>

        {analysis && (
          <div>
            <p className="text-xs text-surface-500 mb-2">Overall Argument Strength</p>
            <StrengthMeter value={analysis.overallStrength} />
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-surface-200">
        {[
          { id: 'claims' as const, label: 'Key Claims', icon: Lightbulb, count: analysis?.keyClaims.length || 0 },
          { id: 'gaps' as const, label: 'Logical Gaps', icon: AlertTriangle, count: analysis?.logicalGaps.length || 0 },
          { id: 'evidence' as const, label: 'Missing Evidence', icon: FileQuestion, count: analysis?.missingEvidence.length || 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors relative ${activeSection === tab.id
                ? 'text-primary-600'
                : 'text-surface-500 hover:text-surface-700'
              }`}
          >
            <div className="flex items-center justify-center gap-1">
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="text-xs bg-surface-100 px-1.5 rounded-full">{tab.count}</span>
            </div>
            {activeSection === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <AnimatePresence mode="wait">
          {activeSection === 'claims' && (
            <motion.div
              key="claims"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {analysis?.keyClaims.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-8 italic">
                  No key claims detected yet
                </p>
              ) : (
                analysis?.keyClaims.map((claim, index) => (
                  <ClaimItem
                    key={claim.id}
                    claim={claim}
                    index={index}
                    onSelect={() => onSelectMarker?.(`claim-${claim.id}`)}
                  />
                ))
              )}
            </motion.div>
          )}

          {activeSection === 'gaps' && (
            <motion.div
              key="gaps"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {analysis?.logicalGaps.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-8 italic">
                  No logical gaps detected yet
                </p>
              ) : (
                analysis?.logicalGaps.map((gap, index) => (
                  <GapItem
                    key={gap.id}
                    gap={gap}
                    index={index}
                    onSelect={() => onSelectMarker?.(`gap-${gap.id}`)}
                  />
                ))
              )}
            </motion.div>
          )}

          {activeSection === 'evidence' && (
            <motion.div
              key="evidence"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {analysis?.missingEvidence.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-8 italic">
                  No missing evidence identified yet
                </p>
              ) : (
                analysis?.missingEvidence.map((item, index) => (
                  <MissingEvidenceItem
                    key={item.id}
                    item={item}
                    index={index}
                    onSelect={() => onSelectMarker?.(`evidence-${item.id}`)}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Suggestions footer */}
      {analysis?.suggestions && analysis.suggestions.length > 0 && (
        <div className="px-4 py-3 border-t border-surface-200 bg-surface-50/50">
          <p className="text-xs font-medium text-surface-600 mb-1">Quick Suggestions:</p>
          <p className="text-xs text-surface-500">{analysis.suggestions[0]}</p>
        </div>
      )}
    </div>
  );
}

