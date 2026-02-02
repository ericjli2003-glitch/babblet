'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, BookOpen, Lightbulb, ExternalLink, PlayCircle, CheckCircle, AlertTriangle, Target, Loader2, Sparkles, ChevronRight, MessageSquarePlus, X, Send, GitBranch, ChevronUp, Trash2, EyeOff, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ClassInsightCardProps {
  title: string;
  score?: number;
  maxScore?: number;
  status: 'excellent' | 'good' | 'needs_improvement' | 'missing';
  moduleReference?: string;
  feedback: string;
  suggestedAction?: {
    text: string;
    linkText?: string;
    linkUrl?: string;
  };
  evidence?: Array<{
    timestamp: string;
    text: string;
    analysis?: string;
  }>;
  courseAlignment?: number;
  defaultExpanded?: boolean;
  autoGenerateInsights?: boolean;
  initialInsights?: string | null;
  onInsightsGenerated?: (criterionTitle: string, insights: string) => void;
  onSeekToTime?: (timeMs: number) => void;
  onRequestMoreInsights?: (criterionTitle: string) => Promise<string>;
  /** Transcript segments for A, B video refs (student submission) */
  citationSegments?: Array<{ timestamp: string | number; text: string }>;
  /** Course/rubric references: short explanation + optional link to source doc */
  courseReferences?: Array<{ id: string; title: string; excerpt?: string; type: 'course' | 'rubric'; explanation?: string; documentUrl?: string }>;
  /** Video URL for preview in reference popover */
  videoUrl?: string | null;
  /** Index of criterion (0,1,2,3...) to pick different video segments for each criterion */
  criterionIndex?: number;
  /** Total number of criteria (used to distribute video references evenly) */
  totalCriteria?: number;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return 0;
}

const statusConfig = {
  excellent: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'Excellent',
  },
  good: {
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Good',
  },
  needs_improvement: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    label: 'Needs Improvement',
  },
  missing: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: 'Missing',
  },
};

// Branch insight type for user-created follow-ups
interface BranchInsight {
  id: string;
  query: string;
  response: string | null;
  isLoading: boolean;
}

export default function ClassInsightCard({
  title,
  score,
  maxScore,
  status,
  moduleReference,
  feedback,
  suggestedAction,
  evidence,
  courseAlignment,
  defaultExpanded = false,
  autoGenerateInsights = false,
  initialInsights,
  onInsightsGenerated,
  onSeekToTime,
  onRequestMoreInsights,
  citationSegments,
  courseReferences,
  videoUrl,
  criterionIndex = 0,
  totalCriteria = 1,
}: ClassInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [localInsights, setLocalInsights] = useState<string | null>(null);
  const additionalInsights = initialInsights ?? localInsights;
  const [isInsightsHidden, setIsInsightsHidden] = useState(false);
  const [branches, setBranches] = useState<BranchInsight[]>([]);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const autoFetchedRef = useRef(false);
  
  // A = video refs — cover full video (including end), non-sequential so refs feel "wherever best" not in order
  // Build segment indices by interleaving from both ends (0, n-1, 1, n-2, ...) so we hit start and end and vary order
  const videoRefsByBullet = useMemo(() => {
    const refs: Array<{ id: 'A'; timestamp: string; timeMs: number; text: string; explanation: string }> = [];
    if (citationSegments && citationSegments.length > 0) {
      const numSegments = citationSegments.length;
      // Interleaved indices: [0, last, 1, last-1, 2, ...] so we definitely include start and end, and order is mixed
      const interleaved: number[] = [];
      for (let i = 0; i < numSegments; i++) {
        if (i % 2 === 0) interleaved.push(Math.floor(i / 2));
        else interleaved.push(numSegments - 1 - Math.floor(i / 2));
      }
      for (let slot = 0; slot < 24; slot++) {
        const segmentIndex = interleaved[slot % interleaved.length];
        const seg = citationSegments[segmentIndex];
        const timeMs = typeof seg.timestamp === 'number' ? seg.timestamp : parseTimestamp(String(seg.timestamp));
        const timestamp = typeof seg.timestamp === 'string' ? seg.timestamp : (timeMs >= 0 ? `${Math.floor(timeMs / 60000)}:${String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')}` : '0:00');
        refs.push({
          id: 'A' as const,
          timestamp,
          timeMs,
          text: seg.text.slice(0, 80) + (seg.text.length > 80 ? '...' : ''),
          explanation: `Student said at ${timestamp}: "${seg.text.slice(0, 60)}${seg.text.length > 60 ? '...' : ''}"`,
        });
      }
    } else if (evidence && evidence.length > 0) {
      const numEvidence = evidence.length;
      const interleaved: number[] = [];
      for (let i = 0; i < numEvidence; i++) {
        if (i % 2 === 0) interleaved.push(Math.floor(i / 2));
        else interleaved.push(numEvidence - 1 - Math.floor(i / 2));
      }
      for (let slot = 0; slot < 24; slot++) {
        const idx = interleaved[slot % interleaved.length];
        const e = evidence[idx];
        refs.push({
          id: 'A' as const,
          timestamp: e.timestamp,
          timeMs: parseTimestamp(e.timestamp),
          text: e.text.slice(0, 80) + (e.text.length > 80 ? '...' : ''),
          explanation: e.analysis || `Evidence at ${e.timestamp}`,
        });
      }
    }
    return refs;
  }, [citationSegments, evidence]);
  
  // B = course/rubric ref — short explanation only; link to source doc if provided
  const courseRefB = useMemo(() => {
    const ref = courseReferences?.[0];
    if (!ref) return null;
    const explanation = ref.explanation?.trim() || (ref.type === 'rubric' ? 'This rubric criterion applies to the insight above.' : 'This course material relates to the insight.');
    return {
      id: 'B' as const,
      title: ref.title,
      type: ref.type,
      explanation,
      documentUrl: ref.documentUrl,
    };
  }, [courseReferences]);
  
  
  // Auto-fetch insights on mount if enabled (only when no persisted insights)
  useEffect(() => {
    if (autoGenerateInsights && onRequestMoreInsights && !initialInsights && !additionalInsights && !autoFetchedRef.current) {
      autoFetchedRef.current = true;
      setIsLoadingInsights(true);
      onRequestMoreInsights(title)
        .then(insights => {
          const insightWithRef = insights.includes('[1]') ? insights : `${insights} [1]`;
          setLocalInsights(insightWithRef);
          onInsightsGenerated?.(title, insightWithRef);
        })
        .catch(err => {
          console.error('Failed to auto-generate insights:', err);
          setLocalInsights('Unable to load insights. Please try again.');
        })
        .finally(() => {
          setIsLoadingInsights(false);
        });
    }
  }, [autoGenerateInsights, onRequestMoreInsights, title, initialInsights, additionalInsights, onInsightsGenerated]);

  const handleRequestInsights = useCallback(async () => {
    if (!onRequestMoreInsights || isLoadingInsights || additionalInsights) return;
    
    setIsLoadingInsights(true);
    try {
      const insights = await onRequestMoreInsights(title);
      const insightWithRef = insights.includes('[1]') ? insights : `${insights} [1]`;
      setLocalInsights(insightWithRef);
      onInsightsGenerated?.(title, insightWithRef);
    } catch (err) {
      console.error('Failed to get insights:', err);
      setLocalInsights('Unable to load additional insights. Please try again.');
    } finally {
      setIsLoadingInsights(false);
    }
  }, [title, onRequestMoreInsights, isLoadingInsights, additionalInsights, onInsightsGenerated]);

  // Handle creating a new branch insight
  const handleCreateBranch = useCallback(async () => {
    if (!branchQuery.trim() || !onRequestMoreInsights) return;
    
    const newBranch: BranchInsight = {
      id: `branch-${Date.now()}`,
      query: branchQuery,
      response: null,
      isLoading: true,
    };
    
    setBranches(prev => [...prev, newBranch]);
    setBranchQuery('');
    setShowBranchInput(false);
    
    try {
      const response = await onRequestMoreInsights(`${title} - specifically about: ${branchQuery}`);
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response, isLoading: false } : b
      ));
    } catch (err) {
      setBranches(prev => prev.map(b => 
        b.id === newBranch.id ? { ...b, response: 'Failed to generate insight. Please try again.', isLoading: false } : b
      ));
    }
  }, [branchQuery, title, onRequestMoreInsights]);

  // Remove a branch
  const removeBranch = useCallback((branchId: string) => {
    setBranches(prev => prev.filter(b => b.id !== branchId));
  }, []);

  // Popover state for reference A/B
  const [openRef, setOpenRef] = useState<string | null>(null);
  const openRefRef = useRef<HTMLDivElement | null>(null);
  // Custom clip player state
  const [clipPlaying, setClipPlaying] = useState(false);
  const [clipProgress, setClipProgress] = useState(0);
  const clipVideoRef = useRef<HTMLVideoElement>(null);
  
  // Render insight content with A, B references
  // A = video/submission, B = course/rubric
  const renderInsightContent = useCallback((content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    
    // Extract A, B from text (standalone letters or [A], {A}, A. etc.)
    const extractRefLetters = (text: string): string[] => {
      const matches = text.match(/\b([AB])\b|\[([AB])\]|\{([AB])\}/gi) || [];
      return matches.map(m => m.replace(/[\[\]{}]/gi, '').toUpperCase());
    };
    
    const stripCitations = (text: string): string => {
      return text
        .replace(/\b[AB]\b(?=\s|$)/gi, '')
        .replace(/\[[AB]\]|\{[AB]\}/gi, '')
        .replace(/\s*\([AB]\)\s*/gi, ' ')  // remove (A) and (B) from response text
        .trim();
    };
    
    const renderText = (text: string) => {
      const cleanText = stripCitations(text);
      if (cleanText.includes('**')) {
        const boldParts = cleanText.split(/\*\*(.*?)\*\*/g);
        return boldParts.map((bp, j) => 
          j % 2 === 1 ? <strong key={j} className="font-semibold text-surface-900">{bp}</strong> : bp
        );
      }
      return cleanText;
    };
    
    // A = video ref: popover with 8-second clip preview (custom controls, no timeline)
    const CLIP_DURATION = 8; // seconds
    
    const handleClipPlayPause = () => {
      const v = clipVideoRef.current;
      if (!v) return;
      if (clipPlaying) {
        v.pause();
        setClipPlaying(false);
      } else {
        v.play();
        setClipPlaying(true);
      }
    };
    
    const getVideoRefForBullet = (bulletIdx: number) =>
      videoRefsByBullet[bulletIdx] ?? videoRefsByBullet[videoRefsByBullet.length - 1] ?? null;

    const renderVideoRef = (ref: { id: 'A'; timestamp: string; timeMs: number; text: string; explanation: string } | null, key: string, displayNum: number) => {
      if (!ref) return null;
      const isOpen = openRef === `v-A-${key}`;
      const clipStart = ref.timeMs / 1000;
      const clipEnd = clipStart + CLIP_DURATION;
      return (
        <div key={key} className="relative inline-block">
          <button
            onClick={() => {
              setOpenRef(isOpen ? null : `v-A-${key}`);
              if (!isOpen) {
                setClipProgress(0);
                setClipPlaying(false);
              }
            }}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            title={`Student video @ ${ref.timestamp}`}
          >
            [{displayNum}]
          </button>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setOpenRef(null); setClipPlaying(false); }} aria-hidden="true" />
              <div ref={openRefRef} className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-surface-200 bg-white shadow-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-surface-900">Clip @ {ref.timestamp}</p>
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{CLIP_DURATION}s clip</span>
                </div>
                {videoUrl && (
                  <div className="rounded overflow-hidden bg-surface-900 mb-2 relative group">
                    {/* Video with native controls but timeline hidden via clip-video class */}
                    <video
                      ref={clipVideoRef}
                      src={videoUrl}
                      className="clip-video w-full aspect-video object-cover"
                      controls
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload noremoteplayback"
                      onLoadedMetadata={(e) => {
                        const v = e.target as HTMLVideoElement;
                        v.currentTime = clipStart;
                      }}
                      onPlay={() => setClipPlaying(true)}
                      onPause={() => setClipPlaying(false)}
                      onTimeUpdate={(e) => {
                        const v = e.target as HTMLVideoElement;
                        const elapsed = v.currentTime - clipStart;
                        const progress = Math.min(Math.max(elapsed / CLIP_DURATION, 0), 1);
                        setClipProgress(progress * 100);
                        if (v.currentTime >= clipEnd - 0.1) {
                          v.pause();
                          v.currentTime = clipStart;
                          setClipPlaying(false);
                          setClipProgress(0);
                        }
                      }}
                      onEnded={() => {
                        setClipPlaying(false);
                        setClipProgress(0);
                        if (clipVideoRef.current) {
                          clipVideoRef.current.currentTime = clipStart;
                        }
                      }}
                    />
                  </div>
                )}
                <p className="text-xs text-surface-600 mb-2 line-clamp-2">&quot;{ref.text}&quot;</p>
                <button
                  onClick={() => { onSeekToTime?.(ref.timeMs); setOpenRef(null); setClipPlaying(false); }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Go to full video
                </button>
              </div>
            </>
          )}
        </div>
      );
    };
    
    // Ref counter: [1], [2], [3] for video clips; course ref reuses same number when same source
    let refCounter = 0;
    const nextRefNum = () => { refCounter += 1; return refCounter; };
    let courseRefDisplayNum: number | undefined; // same number for same class content ref

    // B = course/rubric ref: short explanation + link to source doc
    const renderCourseRef = (displayNum: number, _letter: string, key: string) => {
      const ref = courseRefB;
      if (!ref) return null;
      const isOpen = openRef === `c-B-${key}`;
      return (
        <div key={key} className="relative inline-block">
          <button
            onClick={() => setOpenRef(isOpen ? null : `c-B-${key}`)}
            className="text-[11px] font-medium text-orange-600 hover:text-orange-800 hover:underline transition-colors"
            title={`${ref.type === 'rubric' ? 'Rubric' : 'Course'} reference`}
          >
            [{displayNum}]
          </button>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenRef(null)} aria-hidden="true" />
              <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-surface-200 bg-white shadow-lg p-3">
                <p className="text-xs font-semibold text-surface-900 mb-1.5">{ref.type === 'rubric' ? 'Rubric' : 'Course'}: {ref.title}</p>
                <p className="text-xs text-surface-600 mb-2">{ref.explanation}</p>
                {ref.documentUrl && (
                  <a
                    href={ref.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded border border-primary-200"
                  >
                    <ExternalLink className="w-3 h-3" /> View source
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      );
    };
    
    const renderRefButton = (letter: string, key: string, bulletIdx?: number, refIndexWithinLine?: number) => {
      if (letter === 'A') {
        const globalRefIdx = (bulletIdx ?? 0) * 3 + (refIndexWithinLine ?? 0);
        const ref = getVideoRefForBullet(globalRefIdx);
        const num = nextRefNum();
        return renderVideoRef(ref, key, num);
      }
      if (letter === 'B' && courseRefB) {
        if (courseRefDisplayNum === undefined) courseRefDisplayNum = nextRefNum();
        return renderCourseRef(courseRefDisplayNum, 'B', key);
      }
      return null;
    };
    
    let bulletIndex = 0;
    return (
      <div className="space-y-2">
        {lines.map((line, i) => {
          const refLetters = extractRefLetters(line);
          const isBullet = line.startsWith('- ') || line.startsWith('* ');
          if (isBullet) bulletIndex += 1;
          
          if (line.startsWith('## ')) {
            return (
              <h3 key={i} className="text-base font-semibold text-surface-900 mt-3 mb-1">
                {renderText(line.replace('## ', ''))}
              </h3>
            );
          }
          if (line.startsWith('# ')) {
            return (
              <h2 key={i} className="text-lg font-semibold text-surface-900 mt-3 mb-1">
                {renderText(line.replace('# ', ''))}
              </h2>
            );
          }
          if (isBullet) {
            const thisBulletIdx = bulletIndex - 1; // 0-based for first bullet
            const bulletRef = getVideoRefForBullet(thisBulletIdx);
            const hasVideo = refLetters.some((l) => l === 'A');
            const hasCourse = refLetters.some((l) => l === 'B');
            // Clean the line - remove any trailing A, B markers and (A) (B)
            const cleanLine = line.slice(2).replace(/\s*[AB]\s*$/g, '').trim();
            const refNodes = [
              ...refLetters.map((l, idx) => renderRefButton(l, `${i}-${idx}`, thisBulletIdx, idx)),
              !hasVideo && bulletRef && renderVideoRef(bulletRef, `${i}-v`, nextRefNum()),
              !hasCourse && courseRefB && (() => {
                if (courseRefDisplayNum === undefined) courseRefDisplayNum = nextRefNum();
                return renderCourseRef(courseRefDisplayNum, 'B', `${i}-c`);
              })(),
            ].filter(Boolean);
            return (
              <p key={i} className="text-surface-700">
                <span>• {renderText(cleanLine)}{refNodes.length > 0 ? '\u00A0' : null}</span>
                <span className="whitespace-nowrap inline-flex items-center gap-x-0.5 align-baseline">
                  {refNodes}
                </span>
              </p>
            );
          }
          return (
            <p key={i} className="text-surface-700 flex items-start gap-1 flex-wrap">
              <span>{renderText(line)}</span>
              {refLetters.length > 0 && (
                <span className="inline-flex items-center gap-0.5 ml-1">
                  {refLetters.map((l, idx) => renderRefButton(l, `${i}-${idx}`))}
                </span>
              )}
            </p>
          );
        })}
      </div>
    );
  }, [videoRefsByBullet, courseRefB, videoUrl, onSeekToTime, openRef]);

  return (
    <div className="space-y-4">
      {/* Get More Insights button - only show when no insights yet */}
      {onRequestMoreInsights && !additionalInsights && !isLoadingInsights && (
        <button
          onClick={handleRequestInsights}
          disabled={isLoadingInsights}
          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Insights for {title}
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
      
      {/* Loading state */}
      {isLoadingInsights && (
        <div className="flex items-center gap-2 text-sm text-primary-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyzing {title}...
        </div>
      )}
      
      {/* Insights Panel - show when insights exist */}
      {additionalInsights && (
        <div className="p-4 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-xl">
          {/* Header with hide/delete controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Babblet Insights</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsInsightsHidden(!isInsightsHidden)}
                className="p-1.5 text-surface-400 hover:text-surface-600 rounded-md hover:bg-white/50 transition-colors"
                title={isInsightsHidden ? 'Show insights' : 'Hide insights'}
              >
                {isInsightsHidden ? <ChevronDown className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  setLocalInsights(null);
                  setBranches([]);
                  onInsightsGenerated?.(title, '');
                }}
                className="p-1.5 text-surface-400 hover:text-red-500 rounded-md hover:bg-white/50 transition-colors"
                title="Delete insights"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible content */}
          <AnimatePresence>
            {!isInsightsHidden && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Insight content */}
                <div className="text-sm leading-relaxed">
                  {renderInsightContent(additionalInsights)}
                </div>

                {/* Branch insights */}
                <AnimatePresence>
                  {branches.map((branch) => (
                    <motion.div
                      key={branch.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4 ml-4 pl-4 border-l-2 border-primary-200"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5 text-primary-500" />
                          <span className="text-xs font-medium text-primary-700">{branch.query}</span>
                        </div>
                        <button
                          onClick={() => removeBranch(branch.id)}
                          className="p-1 text-surface-400 hover:text-red-500 rounded-full hover:bg-white/50"
                          title="Delete this branch"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {branch.isLoading ? (
                        <div className="flex items-center gap-2 text-xs text-primary-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Generating insight...
                        </div>
                      ) : branch.response && (
                        <div className="text-sm text-surface-700 bg-white/40 rounded-lg p-3">
                          {renderInsightContent(branch.response)}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Ask a question */}
                <div className="mt-4 pt-3 border-t border-primary-100">
                  <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wide mb-2">
                    Want to dig deeper?
                  </p>
                  {!showBranchInput && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {[
                        'How could they strengthen this section?',
                        'Which rubric criterion does this relate to?',
                        'What would excellent look like here?',
                      ].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => {
                            setBranchQuery(q);
                            setShowBranchInput(true);
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 transition-colors text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    {showBranchInput ? (
                      <motion.div
                        key="input"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={branchQuery}
                          onChange={(e) => setBranchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                          placeholder="Ask a question about this insight..."
                          className="flex-1 px-3 py-2 text-sm bg-white border border-primary-200 rounded-lg focus:ring-2 focus:ring-primary-300 focus:border-primary-300 outline-none"
                          autoFocus
                        />
                        <button
                          onClick={handleCreateBranch}
                          disabled={!branchQuery.trim()}
                          className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setShowBranchInput(false);
                            setBranchQuery('');
                          }}
                          className="p-2 text-surface-500 hover:text-surface-700 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowBranchInput(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors w-full justify-center"
                      >
                        <MessageSquarePlus className="w-4 h-4" />
                        Ask a question
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed state indicator */}
          {isInsightsHidden && (
            <button
              onClick={() => setIsInsightsHidden(false)}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <ChevronDown className="w-3 h-3" />
              Show insights
            </button>
          )}
        </div>
      )}
    </div>
  );
}
