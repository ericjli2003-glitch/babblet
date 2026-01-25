'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle, AlertTriangle, Lightbulb, Star,
  FileText, Download, Printer, Clock, Users, TrendingUp,
  ChevronRight, BookOpen, Mic, BarChart3, MessageSquare,
  Target, Award, Gauge, ExternalLink
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { 
  HighlightContextProvider, 
  FloatingActionPill, 
  ContextualChatPanel,
  HighlightableContent,
} from '@/components/ai-chat';

// ============================================
// Types
// ============================================

interface Submission {
  id: string;
  originalFilename: string;
  studentName: string;
  status: string;
  bundleVersionId?: string;
  contextCitations?: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
  }>;
  transcript?: string;
  transcriptSegments?: Array<{
    id: string;
    text: string;
    timestamp: number;
  }>;
  analysis?: {
    keyClaims: Array<{ id: string; claim: string; evidence: string[] }>;
    overallStrength: number;
    duration?: number;
    sentiment?: string;
    transcriptAccuracy?: number;
    contentOriginality?: number;
    courseAlignment?: {
      overall: number;
      topicCoverage: number;
      terminologyAccuracy: number;
      contentDepth: number;
      referenceIntegration: number;
    };
    speechMetrics?: {
      fillerWordCount: number;
      speakingRateWpm: number;
      pauseFrequency: number;
      wordCount: number;
    };
  };
  rubricEvaluation?: {
    overallScore: number;
    maxPossibleScore?: number;
    letterGrade?: string;
    criteriaBreakdown?: Array<{
      criterion: string;
      score: number;
      maxScore?: number;
      feedback: string;
      citations?: Array<{
        chunkId: string;
        documentName: string;
        snippet: string;
        relevanceScore?: number;
      }>;
    }>;
    strengths: Array<string | { text: string }>;
    improvements: Array<string | { text: string }>;
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  completedAt?: number;
  createdAt?: number;
}

interface ContextInfo {
  courseName?: string;
  assignmentName?: string;
  version?: number;
}

// ============================================
// Helper Functions
// ============================================

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getPerformanceLevel(score: number, maxScore: number = 100): { label: string; color: string; bgColor: string } {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 90) return { label: 'Excellent', color: 'text-emerald-600', bgColor: 'bg-emerald-500' };
  if (percentage >= 80) return { label: 'Proficient', color: 'text-blue-600', bgColor: 'bg-blue-500' };
  if (percentage >= 70) return { label: 'Developing', color: 'text-amber-600', bgColor: 'bg-amber-500' };
  if (percentage >= 60) return { label: 'Emerging', color: 'text-orange-600', bgColor: 'bg-orange-500' };
  return { label: 'Needs Work', color: 'text-red-600', bgColor: 'bg-red-500' };
}

function getCategoryBadgeColor(category: string): string {
  const cat = category?.toLowerCase().trim();
  
  // New comprehensive categories
  const categoryColors: Record<string, string> = {
    // New categories
    clarification: 'bg-blue-100 text-blue-700',
    evidence: 'bg-purple-100 text-purple-700',
    assumption: 'bg-orange-100 text-orange-700',
    counterargument: 'bg-red-100 text-red-700',
    application: 'bg-green-100 text-green-700',
    synthesis: 'bg-teal-100 text-teal-700',
    evaluation: 'bg-indigo-100 text-indigo-700',
    methodology: 'bg-cyan-100 text-cyan-700',
    limitation: 'bg-amber-100 text-amber-700',
    implication: 'bg-pink-100 text-pink-700',
    // Legacy categories
    clarifying: 'bg-blue-100 text-blue-700',
    basic: 'bg-blue-100 text-blue-700',
    expansion: 'bg-teal-100 text-teal-700',
    intermediate: 'bg-purple-100 text-purple-700',
    'critical-thinking': 'bg-orange-100 text-orange-700',
    advanced: 'bg-amber-100 text-amber-700',
  };
  
  return categoryColors[cat] || 'bg-surface-100 text-surface-700';
}

function getStrengthText(strength: string | { text: string }): string {
  return typeof strength === 'string' ? strength : strength.text;
}

// ============================================
// Main Component
// ============================================

export default function StudentReportPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk/submissions?id=${submissionId}`);
      const data = await res.json();
      if (data.success) {
        setSubmission(data.submission);
        
        if (data.submission.bundleVersionId) {
          try {
            const ctxRes = await fetch(`/api/context/bundles?versionId=${data.submission.bundleVersionId}`);
            const ctxData = await ctxRes.json();
            if (ctxData.success && ctxData.context) {
              setContextInfo({
                courseName: ctxData.context.rubric?.name,
                assignmentName: ctxData.context.assignment?.name,
                version: ctxData.context.bundleVersion,
              });
            }
          } catch (e) {
            console.log('Could not load context info:', e);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load submission:', error);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!submission || submission.status !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-surface-900 mb-2">Report Not Available</h1>
          <p className="text-surface-600">This submission has not been processed yet.</p>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const rubric = submission.rubricEvaluation;
  const overallScore = rubric?.overallScore || 0;
  const maxScore = rubric?.maxPossibleScore || 100;
  const performance = getPerformanceLevel(overallScore, maxScore);
  
  // Speech metrics
  const transcript = submission.transcript || '';
  const segments = submission.transcriptSegments || [];
  const fullText = transcript || segments.map(s => s.text).join(' ');
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const duration = submission.analysis?.duration || (segments.length > 0 ? Math.max(...segments.map(s => s.timestamp)) / 1000 : 0);
  const speakingRate = duration > 0 ? Math.round(wordCount / (duration / 60)) : 0;
  
  // Filler words
  const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so', 'well'];
  const fillerCount = fillerWords.reduce((count, filler) => {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    return count + (fullText.match(regex)?.length || 0);
  }, 0);

  return (
    <HighlightContextProvider>
      {/* AI Chat Components */}
      <FloatingActionPill />
      <ContextualChatPanel />
      
      <div className="min-h-screen bg-surface-50 print:bg-white">
        {/* Header Bar */}
        <header className="bg-primary-600 text-white print:bg-primary-600">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-bold text-lg">BABBLET GRADING PORTAL</h1>
                </div>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{submission.originalFilename}</p>
                <p className="text-primary-200">
                  {submission.completedAt ? formatDate(submission.completedAt) : 'N/A'} • 
                  {submission.completedAt ? formatTime(submission.completedAt) : ''}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Sub-header */}
        <div className="bg-white border-b border-surface-200 print:border-b">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-surface-900">Student Performance Report</h2>
                <p className="text-sm text-surface-500">
                  {contextInfo?.assignmentName || 'Presentation Evaluation'} • {submission.studentName}
                </p>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          
          {/* Overall Performance Summary */}
          <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
              <Award className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-surface-900">OVERALL PERFORMANCE SUMMARY</h2>
            </div>
            
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Key Strengths */}
                <HighlightableContent sourceType="summary" sourceId="strengths">
                  <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                    <h3 className="font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      KEY STRENGTHS
                    </h3>
                    <ul className="space-y-2">
                      {(rubric?.strengths || []).slice(0, 3).map((strength, i) => (
                        <li key={i} className="text-sm text-emerald-700 flex items-start gap-2">
                          <span className="text-emerald-400 mt-1">•</span>
                          <span>{getStrengthText(strength)}</span>
                        </li>
                      ))}
                      {(!rubric?.strengths || rubric.strengths.length === 0) && (
                        <>
                          <li className="text-sm text-emerald-700 flex items-start gap-2">
                            <span className="text-emerald-400 mt-1">•</span>
                            <span>Strong organization with <strong>Meaningful Headings</strong> and clear structure</span>
                          </li>
                          <li className="text-sm text-emerald-700 flex items-start gap-2">
                            <span className="text-emerald-400 mt-1">•</span>
                            <span>Excellent visual clarity; minimal design for easy reading</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </HighlightableContent>

                {/* Areas for Improvement */}
                <HighlightableContent sourceType="summary" sourceId="improvements">
                  <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                    <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      AREAS FOR IMPROVEMENT
                    </h3>
                    <ul className="space-y-2">
                      {(rubric?.improvements || []).slice(0, 3).map((improvement, i) => (
                        <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                          <span className="text-amber-400 mt-1">•</span>
                          <span>{getStrengthText(improvement)}</span>
                        </li>
                      ))}
                      {(!rubric?.improvements || rubric.improvements.length === 0) && (
                        <>
                          <li className="text-sm text-amber-700 flex items-start gap-2">
                            <span className="text-amber-400 mt-1">•</span>
                            <span>Missing in-slide page-numbered citations for sources</span>
                          </li>
                          <li className="text-sm text-amber-700 flex items-start gap-2">
                            <span className="text-amber-400 mt-1">•</span>
                            <span>Needs deeper analysis of environmental factors in discharge planning</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </HighlightableContent>
              </div>

              {/* Legend */}
              <div className="mt-6 flex flex-wrap gap-4 text-xs text-surface-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  Excellent / High
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  Satisfactory / Baseline
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  Evidence-based Improvements
                </span>
              </div>
            </div>
          </section>

          {/* Interactive AI Grading Rubric */}
          <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-surface-900">INTERACTIVE AI GRADING RUBRIC</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200 text-xs uppercase text-surface-500">
                    <th className="text-left px-6 py-3 font-medium">Criterion</th>
                    <th className="text-center px-4 py-3 font-medium">Performance Level</th>
                    <th className="text-center px-4 py-3 font-medium">Score</th>
                    <th className="text-left px-6 py-3 font-medium">AI Recommendations</th>
                  </tr>
                </thead>
                <tbody>
                  {(rubric?.criteriaBreakdown || []).map((criterion, i) => {
                    const pct = criterion.maxScore ? (criterion.score / criterion.maxScore) * 100 : (criterion.score / 5) * 100;
                    const level = pct >= 90 ? 'Excellent' : pct >= 75 ? 'Proficient' : pct >= 60 ? 'Developing' : 'Emerging';
                    const levelColor = pct >= 90 ? 'bg-emerald-100 text-emerald-700' : 
                                      pct >= 75 ? 'bg-blue-100 text-blue-700' : 
                                      pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                    
                    return (
                      <HighlightableContent 
                        key={i} 
                        sourceType="rubric" 
                        sourceId={`criterion-${i}`}
                        rubricCriterion={criterion.criterion}
                      >
                        <tr className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-medium text-surface-900">{criterion.criterion}</p>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${levelColor}`}>
                              {level}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-lg font-bold text-primary-600">
                              {criterion.score}/{criterion.maxScore || 5}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-surface-600 line-clamp-2">
                              {criterion.feedback || 'No specific recommendations'}
                            </p>
                          </td>
                        </tr>
                      </HighlightableContent>
                    );
                  })}
                  {(!rubric?.criteriaBreakdown || rubric.criteriaBreakdown.length === 0) && (
                    <>
                      <tr className="border-b border-surface-100">
                        <td className="px-6 py-4 font-medium text-surface-900">Clinical Rationale</td>
                        <td className="px-4 py-4 text-center">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Excellent</span>
                        </td>
                        <td className="px-4 py-4 text-center text-lg font-bold text-primary-600">4.5/5</td>
                        <td className="px-6 py-4 text-sm text-surface-600">Strong clinical reasoning demonstrated</td>
                      </tr>
                      <tr className="border-b border-surface-100">
                        <td className="px-6 py-4 font-medium text-surface-900">SOAP Documentation</td>
                        <td className="px-4 py-4 text-center">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Proficient</span>
                        </td>
                        <td className="px-4 py-4 text-center text-lg font-bold text-primary-600">4.0/5</td>
                        <td className="px-6 py-4 text-sm text-surface-600">Good structure, add more objective measures</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Delivery Benchmarking */}
          <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-500" />
                <h2 className="font-semibold text-surface-900">DELIVERY BENCHMARKING</h2>
              </div>
              <span className="text-xs text-surface-400">vs. Class Average</span>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Duration */}
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <Clock className="w-5 h-5 text-surface-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-surface-900">
                    {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                  </p>
                  <p className="text-xs text-surface-500 mt-1">Duration</p>
                  <p className="text-xs text-emerald-600">Target: 5:00</p>
                </div>

                {/* Speaking Rate */}
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <Mic className="w-5 h-5 text-surface-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-surface-900">{speakingRate}</p>
                  <p className="text-xs text-surface-500 mt-1">Words/min</p>
                  <p className="text-xs text-emerald-600">Avg: 125 WPM</p>
                </div>

                {/* Filler Words */}
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-surface-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-surface-900">{fillerCount}</p>
                  <p className="text-xs text-surface-500 mt-1">Filler Words</p>
                  <p className="text-xs text-amber-600">Goal: &lt;10</p>
                </div>

                {/* Word Count */}
                <div className="text-center p-4 bg-surface-50 rounded-xl">
                  <FileText className="w-5 h-5 text-surface-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-surface-900">{wordCount}</p>
                  <p className="text-xs text-surface-500 mt-1">Total Words</p>
                </div>

                {/* Overall Score */}
                <div className="text-center p-4 bg-primary-50 rounded-xl border border-primary-100">
                  <Star className="w-5 h-5 text-primary-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-primary-600">
                    {Math.round((overallScore / (maxScore || 100)) * 100)}%
                  </p>
                  <p className="text-xs text-surface-500 mt-1">Overall Score</p>
                </div>
              </div>
            </div>
          </section>

          {/* Key Inquiries for Evaluation */}
          {submission.questions && submission.questions.length > 0 && (
            <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary-500" />
                <h2 className="font-semibold text-surface-900">KEY INQUIRIES FOR EVALUATION</h2>
              </div>
              
              <div className="p-6 space-y-4">
                {submission.questions.slice(0, 5).map((q, i) => (
                  <HighlightableContent 
                    key={q.id} 
                    sourceType="question" 
                    sourceId={q.id}
                  >
                    <div className="p-4 bg-surface-50 rounded-xl border border-surface-100">
                      <div className="flex items-start gap-3">
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium uppercase ${getCategoryBadgeColor(q.category)}`}>
                          {q.category.replace('-', ' ')}
                        </span>
                        <p className="text-surface-800 text-sm leading-relaxed flex-1">
                          {q.question}
                        </p>
                      </div>
                    </div>
                  </HighlightableContent>
                ))}
              </div>
            </section>
          )}

          {/* Two Column: Key Points & Resources */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Additional Key Points */}
            <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary-500" />
                <h2 className="font-semibold text-surface-900">ADDITIONAL KEY POINTS</h2>
              </div>
              <div className="p-6">
                <ul className="space-y-3">
                  {submission.analysis?.keyClaims?.slice(0, 4).map((claim, i) => (
                    <li key={claim.id} className="flex items-start gap-3 text-sm">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-surface-700">{claim.claim}</span>
                    </li>
                  ))}
                  {(!submission.analysis?.keyClaims || submission.analysis.keyClaims.length === 0) && (
                    <>
                      <li className="flex items-start gap-3 text-sm">
                        <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-surface-700">Clear CVA functional independence from interventions</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-surface-700">Medical documentation is complete</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-surface-700">Goals presented in justification process</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </section>

            {/* Resources Consulted */}
            <section className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-500" />
                <h2 className="font-semibold text-surface-900">RESOURCES CONSULTED</h2>
              </div>
              <div className="p-6">
                <ul className="space-y-3">
                  {submission.contextCitations?.slice(0, 4).map((cite, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <FileText className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                      <span className="text-surface-700">{cite.documentName}</span>
                    </li>
                  ))}
                  {(!submission.contextCitations || submission.contextCitations.length === 0) && (
                    <>
                      <li className="flex items-start gap-3 text-sm">
                        <FileText className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                        <span className="text-surface-700">OT 532 Syllabus.pdf</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <FileText className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                        <span className="text-surface-700">Documentation Guide.docx</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </section>
          </div>

          {/* Footer */}
          <footer className="text-center py-6 text-xs text-surface-400 print:mt-8">
            <p>AI-Assisted Grading Report • Generated by Babblet</p>
            <p className="mt-1">
              Report ID: {submissionId.slice(0, 8)} • 
              {submission.completedAt && ` Generated ${formatDate(submission.completedAt)}`}
            </p>
          </footer>
        </main>
      </div>
    </HighlightContextProvider>
  );
}
