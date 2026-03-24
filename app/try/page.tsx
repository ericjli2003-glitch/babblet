'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp, AlertCircle, BarChart3, MessageSquare, BookOpen,
  Loader2, CheckCircle, X, Zap, ArrowLeft, Upload, Play,
  ChevronRight, Sparkles,
} from 'lucide-react';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CREDITS = 2;
const MAX_FILE_MB = 300;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const CREDIT_KEY = 'babblet_try_credits';
const UNLOCKED_KEY = 'babblet_try_unlocked';

// ─── Demo transcript ──────────────────────────────────────────────────────────
const DEMO_TRANSCRIPT = `Good afternoon everyone. My name is Sarah Chen and today I will be presenting my analysis of occupational therapy interventions for post-stroke rehabilitation. I will cover the SOAP note documentation, the discharge summary, and evidence-based justification for the skilled services provided.

Beginning with the subjective section of my SOAP note. The client is a 67-year-old male who presents to outpatient occupational therapy following a left hemisphere ischemic stroke six weeks ago. He reports increased confidence in self-care activities over the past two weeks, stating that therapy has helped him regain independence. His primary concern remains difficulty with fine motor tasks, particularly buttoning shirts and handling utensils.

In the objective section, the client completed upper body dressing with minimal assistance, requiring verbal reminders for safety including brake locking and proper sequencing. He demonstrated contact guard assistance for transfers from bed to wheelchair. Grip strength measured at 12 pounds on the right, non-dominant hand, compared to 38 pounds on the left. His living situation includes a single story home with steps at the entrance and limited community mobility due to geographic isolation.

The assessment indicates the client demonstrates neuroplastic recovery consistent with post-stroke rehabilitation trajectory. He shows expressive aphasia and reduced executive functioning that impact occupational performance. Progress is noted in motor recovery though cognitive-communicative deficits continue to affect his functional independence in instrumental activities of daily living.

For the plan, therapy will continue two times per week focusing on ADL training, compensatory strategy development, and caregiver education. Discharge criteria include independence in morning self-care routine and safe community ambulation. We will reassess discharge planning at the four-week mark.

Regarding the discharge summary, the client has achieved improved independence in basic ADLs and demonstrates understanding of compensatory techniques. Improvements in dressing and transfers indicate effective motor relearning. Discharge to home with home health follow-up is recommended once optimal recovery has been achieved.

The justification for skilled services is grounded in current evidence supporting task-specific training for upper extremity recovery post-stroke. Occupational therapy interventions addressed ADLs, cognition, and environmental modification consistent with best practice guidelines.`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalysisResult {
  overallScore: number;
  maxScore: number;
  letterGrade: string;
  summary: string;
  strengths: Array<{ text: string; quote: string }>;
  improvements: Array<{ text: string; quote: string }>;
  rubric: Array<{ criterion: string; score: number; maxScore: number; feedback: string; status: 'strong' | 'adequate' | 'weak' }>;
  questions: Array<{ question: string; category: string; rationale: string; timestamp: string }>;
}

interface GateForm { email: string; phone: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStoredCredits(): number {
  try { const v = localStorage.getItem(CREDIT_KEY); return v !== null ? parseInt(v) : MAX_CREDITS; } catch { return MAX_CREDITS; }
}
function setStoredCredits(n: number) {
  try { localStorage.setItem(CREDIT_KEY, String(n)); } catch {}
}
function isUnlocked(): boolean {
  try { return localStorage.getItem(UNLOCKED_KEY) === '1'; } catch { return false; }
}
function setUnlocked() {
  try { localStorage.setItem(UNLOCKED_KEY, '1'); localStorage.setItem(CREDIT_KEY, String(MAX_CREDITS)); } catch {}
}

const CAT_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  clarification: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Clarification' },
  depth:         { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', label: 'Depth' },
  evidence:      { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0', label: 'Evidence' },
  application:   { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', label: 'Application' },
  assumption:    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF', label: 'Assumption' },
  synthesis:     { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', label: 'Synthesis' },
};

function getCat(c: string) {
  return CAT_COLORS[c?.toLowerCase()] ?? { bg: '#F8F6F1', text: '#1A3A2A', border: '#E8E3D8', label: c };
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreCircle({ score, max, size = 56 }: { score: number; max: number; size?: number }) {
  const pct = max > 0 ? score / max : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  const color = pct >= 0.75 ? '#10b981' : pct >= 0.55 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={5} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" />
      <text x={c} y={c} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size < 50 ? '0.6rem' : '0.8rem', fontWeight: 700, fill: '#0f172a', transform: `rotate(90deg)`, transformOrigin: `${c}px ${c}px`, fontFamily: 'system-ui' }}>
        {score}/{max}
      </text>
    </svg>
  );
}

// ─── Credit pill ──────────────────────────────────────────────────────────────
function CreditBadge({ credits }: { credits: number }) {
  const ok = credits > 0;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      <Zap className="w-3 h-3" />
      {credits} credit{credits !== 1 ? 's' : ''} left
    </span>
  );
}

// ─── Gate modal ───────────────────────────────────────────────────────────────
function GateModal({ onUnlock }: { onUnlock: () => void }) {
  const [form, setForm] = useState<GateForm>({ email: '', phone: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.includes('@')) { setErr('Enter a valid email.'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 600)); // simulate
    setUnlocked();
    onUnlock();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(12px)', background: 'rgba(14,15,12,0.55)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-7 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Unlock unlimited access</h2>
              <p className="text-xs text-slate-500">You've used your free credits</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Enter your details to get <strong>5 more credits</strong> and continue exploring Babblet's AI grading. No credit card required.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Work email <span className="text-red-400">*</span></label>
            <input
              type="email" required value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErr(''); }}
              placeholder="you@university.edu"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone number <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="tel" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
            />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Get 5 more credits</>}
          </button>
          <p className="text-center text-xs text-slate-400">We won't spam you. Your info helps us improve Babblet.</p>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TryPage() {
  const [credits, setCredits] = useState(MAX_CREDITS);
  const [showGate, setShowGate] = useState(false);
  const [videoMode, setVideoMode] = useState<'demo' | 'upload'>('demo');
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState('');
  const [uploadErr, setUploadErr] = useState('');
  const [transcript, setTranscript] = useState(DEMO_TRANSCRIPT);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'rubric'>('overview');
  const [apiErr, setApiErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate credits from localStorage
  useEffect(() => { setCredits(getStoredCredits()); }, []);

  const videoSrc = videoMode === 'upload' && uploadedUrl ? uploadedUrl : '/demo/demo-presentation.mp4';

  const handleUpload = useCallback((file: File) => {
    setUploadErr('');
    if (!file.type.startsWith('video/')) { setUploadErr('Please upload a video file (MP4, MOV, WebM).'); return; }
    if (file.size > MAX_FILE_BYTES) { setUploadErr(`File too large. Max ${MAX_FILE_MB} MB.`); return; }
    setUploadedUrl(URL.createObjectURL(file));
    setUploadedName(file.name);
    setVideoMode('upload');
    setTranscript(`[Transcript from "${file.name}"] — Student presentation video uploaded for analysis. Evaluating content, structure, delivery, and evidence quality.`);
    setResult(null);
  }, []);

  const runAnalysis = async () => {
    const cur = getStoredCredits();
    if (cur <= 0 && !isUnlocked()) { setShowGate(true); return; }

    setApiErr('');
    setLoading(true);

    const newCredits = Math.max(0, cur - 1);
    setStoredCredits(newCredits);
    setCredits(newCredits);

    try {
      const res = await fetch('/api/try', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'full', email: 'trial@babblet.io', transcript }),
      });
      const data = await res.json();
      if (!res.ok) { setApiErr(data.error || 'Analysis failed.'); return; }
      setResult(data.result);
      setActiveTab('overview');
    } catch {
      setApiErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = () => {
    setShowGate(false);
    setCredits(MAX_CREDITS + 3);
    setStoredCredits(MAX_CREDITS + 3);
  };

  const tabs = [
    { id: 'overview' as const, label: 'Key Observations', icon: BarChart3 },
    { id: 'questions' as const, label: 'Questions', icon: MessageSquare },
    { id: 'rubric' as const, label: 'Rubric', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Gate modal */}
      <AnimatePresence>{showGate && <GateModal onUnlock={handleUnlock} />}</AnimatePresence>

      {/* Nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1320px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium" style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#1A3A2A' }}>Babblet</span>
          </Link>
          <div className="flex items-center gap-3">
            <CreditBadge credits={credits} />
            <Link href="/contact" className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 transition-colors">
              Book a Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-[1320px] mx-auto px-4 py-6">
        <div className="grid grid-cols-[1fr_400px] gap-5 items-start">

          {/* ── Left column ── */}
          <div className="space-y-4">
            {/* Student header card (mirrors real app) */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">SC</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base font-bold text-slate-900">Sarah Chen</h1>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] font-medium rounded-full">
                      <CheckCircle className="w-3 h-3" /> Demo submission
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">OT 401 — Post-Stroke Rehabilitation Presentation</p>
                </div>
              </div>
            </div>

            {/* Video card */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Toggle */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-slate-100">
                {(['demo', 'upload'] as const).map(m => (
                  <button key={m} onClick={() => setVideoMode(m)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${videoMode === m ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                    {m === 'demo' ? 'Demo video' : 'Upload your own'}
                  </button>
                ))}
              </div>

              {/* Upload zone */}
              {videoMode === 'upload' && !uploadedUrl && (
                <div
                  className="m-4 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 py-12 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
                >
                  <Upload className="w-7 h-7 text-slate-300" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">Drop your video here</p>
                    <p className="text-xs text-slate-400 mt-1">MP4, MOV, WebM · Max {MAX_FILE_MB} MB</p>
                  </div>
                  <input ref={fileRef} type="file" accept="video/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                </div>
              )}
              {uploadErr && <p className="px-4 pb-3 text-xs text-red-500">{uploadErr}</p>}

              {/* Player */}
              {(videoMode === 'demo' || uploadedUrl) && (
                <video key={videoSrc} src={videoSrc} controls playsInline
                  className="w-full aspect-video block bg-black" />
              )}
              {videoMode === 'upload' && uploadedName && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500">📎 {uploadedName}</p>
                </div>
              )}
            </div>

            {/* Analyze button */}
            <div>
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing presentation…</>
                  : <><Sparkles className="w-4 h-4" /> Analyze with Babblet</>}
              </button>
              {apiErr && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{apiErr}</p>
                </div>
              )}
              {credits <= 1 && credits > 0 && !isUnlocked() && (
                <p className="mt-2 text-center text-xs text-amber-600">⚡ {credits} credit remaining — unlock more below</p>
              )}
            </div>
          </div>

          {/* ── Right column — results panel ── */}
          <div className="space-y-4">
            {/* Score card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Score</p>
                  {result ? (
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-bold text-slate-900">{result.overallScore}</span>
                      <span className="text-sm text-slate-400">/ {result.maxScore}</span>
                      <span className="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg">{result.letterGrade}</span>
                    </div>
                  ) : (
                    <div className="h-9 flex items-center">
                      <span className="text-sm text-slate-400">{loading ? 'Analyzing…' : 'Run analysis to see score'}</span>
                    </div>
                  )}
                </div>
                {result && (
                  <ScoreCircle score={result.overallScore} max={result.maxScore} size={64} />
                )}
              </div>
              {result && (
                <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{result.summary}</p>
              )}
              {!result && !loading && (
                <div className="border-t border-slate-100 pt-3 text-center py-6">
                  <BarChart3 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Click "Analyze with Babblet" to generate a detailed report</p>
                </div>
              )}
              {loading && (
                <div className="border-t border-slate-100 pt-3 text-center py-6">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-400">AI is evaluating the presentation…</p>
                </div>
              )}
            </div>

            {/* Results tabs */}
            {result && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Tab bar */}
                <div className="flex border-b border-slate-100">
                  {tabs.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all border-b-2 ${activeTab === t.id ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="p-4 max-h-[560px] overflow-y-auto">
                  <AnimatePresence mode="wait">

                    {/* ── Overview / Key Observations ── */}
                    {activeTab === 'overview' && (
                      <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                        {/* Strengths */}
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1 mb-2">
                            <ThumbsUp className="w-3 h-3" /> Strengths
                          </p>
                          <div className="space-y-2">
                            {result.strengths.map((s, i) => (
                              <div key={i} className="flex gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-slate-800 leading-relaxed">{s.text}</p>
                                  {s.quote && (
                                    <div className="mt-2 pt-2 border-t border-emerald-200/70">
                                      <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Transcript quotation</p>
                                      <p className="text-[11px] text-slate-700 italic leading-relaxed border-l-2 border-emerald-300 pl-2.5">"{s.quote}"</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Improvements */}
                        <div>
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1 mb-2">
                            <AlertCircle className="w-3 h-3" /> Areas for Improvement
                          </p>
                          <div className="space-y-2">
                            {result.improvements.map((s, i) => (
                              <div key={i} className="flex gap-2.5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-slate-800 leading-relaxed">{s.text}</p>
                                  {s.quote && (
                                    <div className="mt-2 pt-2 border-t border-amber-200/70">
                                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Transcript quotation</p>
                                      <p className="text-[11px] text-slate-700 italic leading-relaxed border-l-2 border-amber-300 pl-2.5">"{s.quote}"</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ── Questions ── */}
                    {activeTab === 'questions' && (
                      <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                        {result.questions.map((q, i) => {
                          const cat = getCat(q.category);
                          return (
                            <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                                  style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>
                                  {cat.label}
                                </span>
                                <p className="text-xs font-semibold text-slate-900 leading-snug">{q.question}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] text-slate-500 leading-relaxed pr-2">{q.rationale}</p>
                                {q.timestamp && (
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">{q.timestamp}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}

                    {/* ── Rubric ── */}
                    {activeTab === 'rubric' && (
                      <motion.div key="rubric" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                        {result.rubric.map((c, i) => {
                          const pct = c.maxScore > 0 ? c.score / c.maxScore : 0;
                          const statusColor = c.status === 'strong' ? 'emerald' : c.status === 'adequate' ? 'amber' : 'red';
                          const statusLabels = { strong: 'Strong', adequate: 'Adequate', weak: 'Needs Work' };
                          return (
                            <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ScoreCircle score={c.score} max={c.maxScore} size={44} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-900 truncate">{c.criterion}</p>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-${statusColor}-100 text-${statusColor}-700`}>
                                      {statusLabels[c.status]}
                                    </span>
                                  </div>
                                </div>
                                {/* Mini bar */}
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full flex-shrink-0">
                                  <div className={`h-full rounded-full bg-${statusColor}-500`} style={{ width: `${pct * 100}%` }} />
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">{c.feedback}</p>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Upsell card */}
            {credits <= 0 && !isUnlocked() && (
              <div className="bg-emerald-800 rounded-2xl p-5 text-white">
                <p className="text-sm font-bold mb-1">Want the full Babblet experience?</p>
                <p className="text-xs opacity-75 mb-4 leading-relaxed">Unlimited grading, rubric uploads, class management, and detailed rubric-grounded feedback.</p>
                <Link href="/contact"
                  className="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                  Book a Demo <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
