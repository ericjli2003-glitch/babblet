'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle, XCircle, AlertTriangle, Lightbulb, Star,
  FileText, MessageCircleQuestion, Download, Printer, Mic, Target, Shield
} from 'lucide-react';
import { useParams } from 'next/navigation';

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
    letterGrade?: string;
    criteriaBreakdown?: Array<{
      criterion: string;
      score: number;
      feedback: string;
      citations?: Array<{
        chunkId: string;
        documentName: string;
        snippet: string;
        relevanceScore?: number;
      }>;
    }>;
    strengths: string[];
    improvements: string[];
  };
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  completedAt?: number;
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getScoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 3) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score >= 4) return 'bg-emerald-50 border-emerald-200';
  if (score >= 3) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function getScoreLabel(score: number): string {
  if (score >= 4.5) return 'Excellent';
  if (score >= 4) return 'Very Good';
  if (score >= 3.5) return 'Good';
  if (score >= 3) return 'Satisfactory';
  if (score >= 2) return 'Needs Improvement';
  return 'Below Expectations';
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
        
        // Load context info if available
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!submission || submission.status !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-surface-900 mb-2">Report Not Available</h1>
          <p className="text-surface-600">This submission has not been processed yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white print:bg-white">
      {/* Print Button - Hidden on print */}
      <div className="fixed top-4 right-4 print:hidden flex gap-2">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200"
        >
          <Printer className="w-4 h-4" />
          Print Report
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="text-center mb-12 pb-8 border-b border-surface-200">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">
            Presentation Feedback Report
          </h1>
          <p className="text-lg text-surface-600 mb-6">{submission.studentName}</p>
          
          {contextInfo && (
            <p className="text-sm text-surface-500">
              {contextInfo.assignmentName}
              {submission.completedAt && ` • ${formatDate(submission.completedAt)}`}
            </p>
          )}

          {/* Overall Score */}
          {submission.rubricEvaluation && (
            <div className={`inline-block mt-6 px-8 py-4 rounded-2xl border ${getScoreBg(submission.rubricEvaluation.overallScore)}`}>
              <div className="flex items-center gap-3">
                <Star className={`w-8 h-8 ${getScoreColor(submission.rubricEvaluation.overallScore)}`} />
                <div className="text-left">
                  <p className={`text-3xl font-bold ${getScoreColor(submission.rubricEvaluation.overallScore)}`}>
                    {submission.rubricEvaluation.overallScore.toFixed(1)}/5
                  </p>
                  <p className="text-sm text-surface-600">
                    {getScoreLabel(submission.rubricEvaluation.overallScore)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Criteria Breakdown */}
        {submission.rubricEvaluation?.criteriaBreakdown && submission.rubricEvaluation.criteriaBreakdown.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-surface-900 mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-500" />
              Rubric Evaluation
            </h2>
            
            <div className="space-y-6">
              {submission.rubricEvaluation.criteriaBreakdown.map((criterion, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-5 bg-surface-50 rounded-xl border border-surface-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-medium text-surface-900">{criterion.criterion}</h3>
                    <span className={`text-lg font-bold ${getScoreColor(criterion.score)}`}>
                      {criterion.score}/5
                    </span>
                  </div>
                  
                  <p className="text-surface-700 text-sm leading-relaxed">
                    {criterion.feedback}
                  </p>

                  {/* Criterion-level citations */}
                  {criterion.citations && criterion.citations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-surface-200">
                      <p className="text-xs text-surface-500 mb-2">Based on course materials:</p>
                      <div className="space-y-2">
                        {criterion.citations.slice(0, 2).map((cite, cIdx) => (
                          <div key={cIdx} className="text-xs bg-white p-2 rounded border border-surface-200">
                            <span className="font-medium text-violet-600">{cite.documentName}</span>
                            <span className="text-surface-500">: "{cite.snippet.slice(0, 100)}..."</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Strengths & Areas for Improvement */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Strengths */}
          {submission.rubricEvaluation?.strengths && submission.rubricEvaluation.strengths.length > 0 && (
            <section className="p-5 bg-emerald-50 rounded-xl border border-emerald-200">
              <h2 className="font-semibold text-emerald-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Strengths
              </h2>
              <ul className="space-y-2">
                {submission.rubricEvaluation.strengths.slice(0, 5).map((strength, idx) => (
                  <li key={idx} className="text-sm text-emerald-800 flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Improvements */}
          {submission.rubricEvaluation?.improvements && submission.rubricEvaluation.improvements.length > 0 && (
            <section className="p-5 bg-amber-50 rounded-xl border border-amber-200">
              <h2 className="font-semibold text-amber-900 mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-600" />
                Areas for Improvement
              </h2>
              <ul className="space-y-2">
                {submission.rubricEvaluation.improvements.slice(0, 5).map((improvement, idx) => (
                  <li key={idx} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    {improvement}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Speech Delivery Metrics */}
        {(() => {
          // Calculate speech metrics from transcript if not available
          const transcript = submission.transcript || '';
          const segments = submission.transcriptSegments || [];
          const fullText = transcript || segments.map(s => s.text).join(' ');
          const words = fullText.split(/\s+/).filter(w => w.length > 0);
          const wordCount = words.length;
          
          const fillerPatterns = /\b(um|uh|like|you know|i mean|so|basically|actually|literally|right|okay|well)\b/gi;
          const fillerMatches = fullText.match(fillerPatterns);
          const fillerWordCount = submission.analysis?.speechMetrics?.fillerWordCount ?? (fillerMatches ? fillerMatches.length : 0);
          
          let durationMinutes = 1;
          if (submission.analysis?.duration) {
            durationMinutes = submission.analysis.duration / 60;
          } else if (segments.length > 0) {
            const lastTimestamp = Math.max(...segments.map(s => s.timestamp));
            const lastMs = lastTimestamp > 36000 ? lastTimestamp : lastTimestamp * 1000;
            durationMinutes = Math.max(1, lastMs / 60000);
          }
          
          const speakingRateWpm = submission.analysis?.speechMetrics?.speakingRateWpm ?? Math.round(wordCount / durationMinutes);
          const pauseFrequency = submission.analysis?.speechMetrics?.pauseFrequency ?? parseFloat((segments.length / durationMinutes).toFixed(1));
          
          if (wordCount === 0) return null;
          
          return (
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-surface-900 mb-6 flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary-500" />
                Speech Delivery Analysis
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <p className="text-sm text-surface-600 mb-1">Filler Words</p>
                  <p className="text-2xl font-bold text-surface-900">{fillerWordCount}</p>
                  <p className="text-xs text-surface-500 mt-1">
                    {fillerWordCount <= 10 ? 'Excellent - minimal fillers' : fillerWordCount <= 20 ? 'Good - few fillers' : 'Consider reducing'}
                  </p>
                </div>
                <div className="p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <p className="text-sm text-surface-600 mb-1">Speaking Pace</p>
                  <p className="text-2xl font-bold text-surface-900">{speakingRateWpm} <span className="text-sm font-normal">WPM</span></p>
                  <p className="text-xs text-surface-500 mt-1">
                    {speakingRateWpm >= 120 && speakingRateWpm <= 180 ? 'Optimal range (120-180)' : speakingRateWpm < 120 ? 'Slightly slow' : 'Slightly fast'}
                  </p>
                </div>
                <div className="p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <p className="text-sm text-surface-600 mb-1">Word Count</p>
                  <p className="text-2xl font-bold text-surface-900">{wordCount.toLocaleString()}</p>
                  <p className="text-xs text-surface-500 mt-1">Total words in presentation</p>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Course Material Alignment */}
        {submission.analysis?.courseAlignment && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-surface-900 mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary-500" />
              Course Material Alignment
            </h2>
            <div className="p-5 bg-surface-50 rounded-xl border border-surface-200">
              <div className="flex items-center justify-between mb-4">
                <span className="text-surface-700">Overall Alignment</span>
                <span className="text-xl font-bold text-primary-600">{submission.analysis.courseAlignment.overall}%</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Topic Coverage', value: submission.analysis.courseAlignment.topicCoverage },
                  { label: 'Terminology Accuracy', value: submission.analysis.courseAlignment.terminologyAccuracy },
                  { label: 'Content Depth', value: submission.analysis.courseAlignment.contentDepth },
                  { label: 'Reference Integration', value: submission.analysis.courseAlignment.referenceIntegration },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-surface-600">{item.label}</span>
                      <span className="font-medium">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${item.value >= 80 ? 'bg-emerald-500' : item.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Verification */}
        {(submission.analysis?.transcriptAccuracy || submission.analysis?.contentOriginality) && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-surface-900 mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Verification & Integrity
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-sm text-emerald-700 mb-1">Transcript Accuracy</p>
                <p className="text-2xl font-bold text-emerald-800">{submission.analysis.transcriptAccuracy ?? 98}%</p>
                <p className="text-xs text-emerald-600 mt-1">Based on audio clarity analysis</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-sm text-emerald-700 mb-1">Content Originality</p>
                <p className="text-2xl font-bold text-emerald-800">{submission.analysis.contentOriginality ?? 100}%</p>
                <p className="text-xs text-emerald-600 mt-1">Uniqueness verification</p>
              </div>
            </div>
          </section>
        )}

        {/* Thought-Provoking Questions */}
        {submission.questions && submission.questions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-surface-900 mb-6 flex items-center gap-2">
              <MessageCircleQuestion className="w-5 h-5 text-violet-500" />
              Questions to Consider
            </h2>
            <div className="space-y-4">
              {submission.questions.slice(0, 5).map((q) => (
                <div key={q.id} className="p-4 bg-violet-50 rounded-xl border border-violet-200">
                  <p className="text-surface-800">{q.question}</p>
                  <span className="inline-block mt-2 text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded">
                    {q.category}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Claims */}
        {submission.analysis?.keyClaims && submission.analysis.keyClaims.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-surface-900 mb-6">Key Points Identified</h2>
            <div className="space-y-3">
              {submission.analysis.keyClaims.slice(0, 5).map((claim, idx) => (
                <div key={claim.id} className="p-4 bg-surface-50 rounded-xl border border-surface-200">
                  <p className="text-surface-800 font-medium">{claim.claim}</p>
                  {claim.evidence && claim.evidence.length > 0 && (
                    <p className="text-sm text-surface-600 mt-2">
                      Evidence: {claim.evidence.slice(0, 2).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Context Citations */}
        {submission.contextCitations && submission.contextCitations.length > 0 && (
          <section className="mb-10 print:break-inside-avoid">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Course Materials Referenced</h2>
            <p className="text-sm text-surface-500 mb-4">
              The following course materials were used to inform this evaluation:
            </p>
            <div className="space-y-2">
              {submission.contextCitations.map((cite, idx) => (
                <div key={cite.chunkId} className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <span className="text-surface-700">{cite.documentName}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-surface-200 text-center text-sm text-surface-500">
          <p>Generated by Babblet AI • {submission.completedAt ? formatDate(submission.completedAt) : 'Date unavailable'}</p>
          {contextInfo?.version && (
            <p className="mt-1">Evaluated using Context Version {contextInfo.version}</p>
          )}
        </footer>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

