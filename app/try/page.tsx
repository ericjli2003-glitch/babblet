'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp, AlertCircle, BarChart3, MessageSquare, BookOpen,
  Loader2, CheckCircle, Zap, ArrowLeft, Upload, Download,
  ChevronRight, Sparkles, Mic,
} from 'lucide-react';
import Link from 'next/link';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CREDITS = 2;
const MAX_FILE_MB = 300;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const CREDIT_KEY = 'babblet_try_credits';
const UNLOCKED_KEY = 'babblet_try_unlocked';
const CACHE_KEY = 'babblet_try_result';

// ─── Pre-computed demo results ────────────────────────────────────────────────
const DEMO_RESULT: AnalysisResult = {
  overallScore: 82,
  maxScore: 100,
  letterGrade: 'B+',
  summary: 'The student delivers a well-structured SOAP note analysis with strong clinical knowledge and appropriate use of OT terminology. The presentation effectively covers subjective, objective, assessment, and plan components, though opportunities exist for deeper evidence-based justification and more specific discharge criteria.',
  speechMetrics: {
    fillerWords: 1,
    wordsPerMin: 125,
    pausesPerMin: 7.6,
  },
  strengths: [
    { text: 'Comprehensive SOAP note structure with clear delineation between subjective, objective, assessment, and plan sections. Demonstrates strong clinical documentation skills.', quote: 'Beginning with the subjective section of my SOAP note. The client is a 67-year-old male who presents to outpatient occupational therapy following a left hemisphere ischemic stroke six weeks ago.' },
    { text: 'Appropriate use of clinical terminology and understanding of post-stroke rehabilitation trajectory, including neuroplastic recovery and cognitive-communicative deficits.', quote: 'The assessment indicates the client demonstrates neuroplastic recovery consistent with post-stroke rehabilitation trajectory. He shows expressive aphasia and reduced executive functioning that impact occupational performance.' },
    { text: 'Effective inclusion of functional outcome measures and environmental context that demonstrate holistic client evaluation.', quote: 'Grip strength measured at 12 pounds on the right, non-dominant hand, compared to 38 pounds on the left. His living situation includes a single story home with steps at the entrance.' },
  ],
  improvements: [
    { text: 'Discharge criteria could be more specific and measurable. Use standardized outcome measures (e.g., FIM scores) to define clear benchmarks for discharge readiness.', quote: 'Discharge criteria include independence in morning self-care routine and safe community ambulation.' },
    { text: 'Evidence-based justification section lacks specific citations to research studies or clinical practice guidelines. Reference specific frameworks (e.g., AOTA guidelines, Cochrane reviews).', quote: 'The justification for skilled services is grounded in current evidence supporting task-specific training for upper extremity recovery post-stroke.' },
    { text: 'Consider addressing psychosocial factors and client/family goals more explicitly in the subjective section to strengthen person-centered care documentation.', quote: 'He reports increased confidence in self-care activities over the past two weeks, stating that therapy has helped him regain independence.' },
  ],
  rubric: [
    {
      criterion: 'Content Knowledge', score: 18, maxScore: 20, feedback: 'Demonstrates solid foundational knowledge of SOAP note structure and post-stroke OT intervention.', status: 'strong',
      insights: {
        overview: 'Taylor demonstrates solid foundational knowledge of SOAP note structure and post-stroke OT intervention, but the content analysis reveals a pattern of asserting clinical concepts without the depth of understanding or evidence integration the rubric expects. The presentation shows familiarity with key terminology—neuroplasticity, motor relearning, executive functioning—yet struggles to move beyond surface-level application of these concepts to demonstrate true conceptual mastery.',
        strengths: [
          { text: 'The clinical picture includes appropriate OT-relevant deficits: "right sided hemiparesis, impaired balance, decreased coordination, expressive aphasia, and reduced executive functioning" shows understanding that CVA impacts multiple performance areas occupational therapists address.', refs: [2, 4] },
          { text: 'Notably, the discharge summary acknowledges the multifaceted nature of OT intervention: "Occupational therapy interventions addressed ADLs, cognition, balance, and psychosocial adjustment" reflects accurate role understanding that OT extends beyond just physical rehabilitation.', refs: [3, 4] },
          { text: 'The contextual factors mentioned—"single story home with steps at the entrance and limited community resources due to geographic isolation"—demonstrate understanding that environmental and social contexts matter for discharge planning, which aligns with client-centered practice principles.', refs: [1, 4] },
        ],
        improvements: [
          { text: 'The claim that "the client demonstrates neuroplastic recovery consistent with post stroke rehabilitation literature" lacks any explanation of *what* neuroplastic recovery means or *how* the observed improvements (dressing, transfers) specifically reflect neuroplastic principles. The rubric\'s "conceptual understanding" component requires more than terminology dropping—it needs demonstration that you understand the underlying mechanism.', refs: [4] },
          { text: 'When stating "Research supports intensive therapy following CVA to maximize functional independence," no specific research is cited, no intensity parameters are defined, and no connection is made to the client\'s actual therapy schedule of "2×/week."', refs: [3] },
        ],
      },
    },
    {
      criterion: 'Structure', score: 14, maxScore: 20, feedback: 'Well-organized SOAP note with clear section delineation. Transitions are logical but could be more explicitly signposted.', status: 'strong',
      insights: {
        overview: 'The presentation follows a clear SOAP note framework with appropriate sequencing from subjective through plan. Section boundaries are explicit and the logical flow supports clinical reasoning. Minor improvements in transitional language and summary statements would strengthen the overall structure.',
        strengths: [
          { text: '"Beginning with the subjective section..." and "In the objective section..." clearly delineate SOAP components and orient the audience to the documentation structure being used.', refs: [1] },
          { text: 'The plan section logically follows from the assessment findings, with therapy goals directly addressing the functional deficits identified in the objective section.', refs: [3] },
        ],
        improvements: [
          { text: 'The transition from objective findings to assessment lacks an explicit synthesis statement connecting the two sections. A brief integrative sentence before the assessment would strengthen clinical reasoning demonstration.', refs: [2] },
          { text: 'The discharge summary is presented as a separate section but its relationship to the ongoing treatment plan is unclear—is this a projected discharge or current status?', refs: [4] },
        ],
      },
    },
    {
      criterion: 'Visual Aids', score: 8, maxScore: 15, feedback: 'Minimal use of visual support. The verbal presentation was clear but slides did not consistently reinforce spoken content.', status: 'adequate',
      insights: {
        overview: 'Visual aids were underutilized relative to the complexity of clinical information being presented. While the spoken delivery was organized, the slides lacked the visual reinforcement needed to help an audience track SOAP note components, understand functional metrics, or visualize the client\'s progress.',
        strengths: [
          { text: 'The title slide clearly identified the assignment type and client context, providing helpful orientation before the detailed clinical information began.', refs: [1] },
        ],
        improvements: [
          { text: 'Objective data such as grip strength measurements (12 lbs vs 38 lbs) and functional assistance levels (minimal assist, contact guard) would benefit from visual representation—a simple table or progress chart would significantly improve comprehension.', refs: [2] },
          { text: 'The discharge criteria ("independence in morning self-care routine") are abstract without a visual checklist or timeline showing the progression from current to target performance.', refs: [3] },
        ],
      },
    },
    {
      criterion: 'Delivery', score: 10, maxScore: 10, feedback: 'Professional and confident delivery throughout. Pacing was appropriate and clinical terminology was used fluently and accurately.', status: 'strong',
      insights: {
        overview: 'Delivery was a clear strength of this presentation. Taylor maintained a professional tone, spoke at a measured pace (125 wpm—within the optimal 120–180 range), and used clinical terminology with accuracy and confidence. Only one filler word was detected across the full presentation.',
        strengths: [
          { text: 'Speaking rate of 125 words per minute falls within the optimal comprehension range and allowed for clear articulation of complex clinical terminology without rushing.', refs: [1] },
          { text: 'Minimal use of filler words (1 instance detected) compared to the class average of 17 demonstrates strong verbal preparation and clinical communication skills.', refs: [2] },
        ],
        improvements: [
          { text: 'While delivery was fluent, more dynamic emphasis on key findings (e.g., raising vocal intensity when reporting grip strength discrepancy) would help the audience identify critical clinical data points.', refs: [3] },
        ],
      },
    },
  ],
  questions: [
    { question: 'You mention "neuroplastic recovery consistent with post-stroke rehabilitation trajectory." What specific evidence or assessment tools did you use to determine the client is on a typical recovery trajectory?', category: 'evidence', rationale: 'Tests ability to distinguish between clinical observation and evidence-based assessment.', timestamp: '1:12' },
    { question: 'The discharge criteria mention "independence in morning self-care routine." How would you operationally define and measure this using standardized OT outcome measures?', category: 'depth', rationale: 'Assesses understanding of measurable outcomes in clinical documentation.', timestamp: '1:38' },
    { question: 'Given the client\'s geographic isolation and limited community mobility, how might you incorporate telehealth or community-based resources into the treatment plan?', category: 'application', rationale: 'Tests ability to adapt evidence-based interventions to real-world constraints.', timestamp: '0:52' },
    { question: 'You identified both expressive aphasia and reduced executive functioning. How do these cognitive-communicative deficits specifically impact your choice of compensatory strategies versus restorative approaches?', category: 'synthesis', rationale: 'Evaluates clinical reasoning about intervention selection based on client presentation.', timestamp: '1:20' },
    { question: 'What assumptions are you making about caregiver availability and willingness to participate in the education component of the treatment plan?', category: 'assumption', rationale: 'Highlights potential gaps in person-centered planning.', timestamp: '1:45' },
  ],
  transcript: [
    { timestamp: '0:00', text: 'Good afternoon everyone. My name is Taylor, and this presentation is for my occupational therapy documentation course.' },
    { timestamp: '0:08', text: 'I\'ll be presenting a comprehensive SOAP note analysis, discharge summary, and evidence based justification of skilled services for a client with a left cerebrovascular accident, incorporating best practices and current standards of care.' },
    { timestamp: '0:22', text: 'The client is a 65 year old male with a left CVA currently receiving occupational therapy services in a skilled nursing facility following an acute hospitalization.' },
    { timestamp: '0:33', text: 'He presents with right sided hemiparesis, impaired balance, decreased coordination, expressive aphasia, and reduced executive functioning.' },
    { timestamp: '0:42', text: 'He lives with his partner in a single story home with steps at the entrance and limited community resources due to geographic isolation.' },
    { timestamp: '0:52', text: 'In this objective section, the client reports increased confidence with daily routines and states that therapy has helped him gain has helped him regain independence.' },
    { timestamp: '1:01', text: 'In the objective section, the client completed upper body dressing with minimal assistance, requiring verbal cueing for sequencing.' },
    { timestamp: '1:10', text: 'He demonstrated contact guard assist for bed to wheelchair transfers. Grip strength measured at 12 pounds on the affected right hand compared to 38 pounds on the left.' },
    { timestamp: '1:22', text: 'The assessment indicates neuroplastic recovery consistent with post-stroke rehabilitation. Expressive aphasia and reduced executive functioning continue to impact occupational performance.' },
    { timestamp: '1:35', text: 'For the plan, therapy will continue twice weekly focusing on ADL training, compensatory strategy development, and caregiver education. Discharge criteria include independence in morning self-care routine.' },
    { timestamp: '1:50', text: 'Regarding the discharge summary, the client has achieved improved independence in basic ADLs and demonstrates understanding of compensatory techniques.' },
    { timestamp: '2:02', text: 'Improvements in dressing and transfers indicate effective motor relearning. Discharge to home with home health follow-up is recommended.' },
    { timestamp: '2:15', text: 'The justification for skilled services is grounded in current evidence supporting task-specific training for upper extremity recovery post-stroke.' },
    { timestamp: '2:28', text: 'Occupational therapy interventions addressed ADLs, cognition, and environmental modification consistent with best practice guidelines.' },
    { timestamp: '2:40', text: 'Thank you for your time. I\'m happy to answer any questions about the clinical reasoning behind these interventions.' },
  ],
};

const DEMO_TRANSCRIPT_TEXT = DEMO_RESULT.transcript!.map(s => s.text).join(' ');

// ─── Types ────────────────────────────────────────────────────────────────────
interface RubricInsight {
  overview: string;
  strengths: Array<{ text: string; refs: number[] }>;
  improvements: Array<{ text: string; refs: number[] }>;
}
interface RubricCriterion {
  criterion: string; score: number; maxScore: number; feedback: string;
  status: 'strong' | 'adequate' | 'weak';
  insights?: RubricInsight;
}
interface AnalysisResult {
  overallScore: number;
  maxScore: number;
  letterGrade: string;
  summary: string;
  speechMetrics?: { fillerWords: number; wordsPerMin: number; pausesPerMin: number };
  strengths: Array<{ text: string; quote: string }>;
  improvements: Array<{ text: string; quote: string }>;
  rubric: RubricCriterion[];
  questions: Array<{ question: string; category: string; rationale: string; timestamp: string }>;
  transcript?: Array<{ timestamp: string; text: string }>;
}

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
  try { localStorage.setItem(UNLOCKED_KEY, '1'); localStorage.setItem(CREDIT_KEY, String(MAX_CREDITS + 3)); } catch {}
}
function getCachedResult(): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCachedResult(result: AnalysisResult) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
}

const CAT_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  clarification:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Clarification',      icon: '💬' },
  depth:            { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', label: 'Depth',              icon: '🔍' },
  'evidence request': { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0', label: 'Evidence Request', icon: '📊' },
  evidence:         { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0', label: 'Evidence Request',   icon: '📊' },
  application:      { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', label: 'Application',        icon: '⚙️' },
  'assumption challenge': { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF', label: 'Assumption Challenge', icon: '🔎' },
  assumption:       { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF', label: 'Assumption Challenge', icon: '🔎' },
  synthesis:        { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', label: 'Synthesis',          icon: '🔗' },
};

function getCat(c: string) {
  return CAT_STYLES[c?.toLowerCase()] ?? { bg: '#F8F6F1', text: '#1A3A2A', border: '#E8E3D8', label: c, icon: '❓' };
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
        style={{ fontSize: size < 50 ? '0.6rem' : '0.8rem', fontWeight: 700, fill: '#0f172a', transform: 'rotate(90deg)', transformOrigin: `${c}px ${c}px`, fontFamily: 'system-ui' }}>
        {score}/{max}
      </text>
    </svg>
  );
}

// ─── Gate modal (blurred background) ──────────────────────────────────────────
function GateModal({ onUnlock }: { onUnlock: () => void }) {
  const [form, setForm] = useState({ name: '', institution: '', email: '', phone: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.includes('@')) { setErr('Enter a valid email.'); return; }
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setUnlocked();
    onUnlock();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(14,15,12,0.5)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="px-6 pt-7 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Continue exploring Babblet</h2>
              <p className="text-xs text-slate-500">You&apos;ve used your free credits</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Enter your details to get <strong>5 more credits</strong> and continue AI-powered grading. No credit card required.
          </p>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full name <span className="text-red-400">*</span></label>
              <input type="text" required value={form.name}
                onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErr(''); }}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Institution</label>
              <input type="text" value={form.institution}
                onChange={e => setForm(p => ({ ...p, institution: e.target.value }))}
                placeholder="University of..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Work email <span className="text-red-400">*</span></label>
            <input type="email" required value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErr(''); }}
              placeholder="you@university.edu"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone number <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="tel" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Get 5 more credits</>}
          </button>
          <p className="text-center text-[11px] text-slate-400">We&apos;ll never spam you. Your info helps us improve Babblet.</p>
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
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'rubric'>('overview');
  const [selectedCriterionIdx, setSelectedCriterionIdx] = useState(0);
  const [apiErr, setApiErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // On mount: hydrate credits, load demo result immediately
  useEffect(() => {
    setCredits(getStoredCredits());
    // Demo always shows pre-computed results
    const cached = getCachedResult();
    if (cached) {
      setResult(cached);
    } else {
      setResult(DEMO_RESULT);
      setCachedResult(DEMO_RESULT);
    }
  }, []);

  const videoSrc = videoMode === 'upload' && uploadedUrl ? uploadedUrl : '/demo/demo-video.mp4';

  const handleUpload = useCallback((file: File) => {
    setUploadErr('');
    if (!file.type.startsWith('video/')) { setUploadErr('Please upload a video file (MP4, MOV, WebM).'); return; }
    if (file.size > MAX_FILE_BYTES) { setUploadErr(`File too large. Max ${MAX_FILE_MB} MB.`); return; }
    setUploadedUrl(URL.createObjectURL(file));
    setUploadedName(file.name);
    setVideoMode('upload');
    setResult(null);
  }, []);

  const runAnalysis = async () => {
    if (videoMode === 'demo') {
      setResult(DEMO_RESULT);
      setCachedResult(DEMO_RESULT);
      return;
    }

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
        body: JSON.stringify({
          action: 'full',
          email: 'trial@babblet.io',
          transcript: `[Student presentation: ${uploadedName}] — Uploaded video for analysis.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setApiErr(data.error || 'Analysis failed.'); return; }
      setResult(data.result);
      setCachedResult(data.result);
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

  const sm = result?.speechMetrics ?? DEMO_RESULT.speechMetrics!;
  const transcript = result?.transcript ?? DEMO_RESULT.transcript!;

  return (
    <div className="h-screen flex flex-col bg-[#F9FAFB]">
      {/* Gate modal */}
      <AnimatePresence>{showGate && <GateModal onUnlock={handleUnlock} />}</AnimatePresence>

      {/* ── Header (matches real submission page) ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-4 mb-3">
          <Link href="/" className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <nav className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-emerald-700 transition-colors">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="hover:text-emerald-700 transition-colors cursor-default">Courses</span>
            <ChevronRight className="w-4 h-4" />
            <span className="hover:text-emerald-700 transition-colors cursor-default">Assignment 1</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 font-medium">Babblet2</span>
          </nav>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-lg font-semibold">B</div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">Babblet2</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Submitted on time
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  <Zap className="w-3 h-3" /> {credits} credit{credits !== 1 ? 's' : ''} left
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">Submission: Assignment &bull; Mar 23, 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium">
              <Download className="w-4 h-4" /> Export Report
            </button>
            <Link href="/contact" className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-semibold">
              Finalize Grade
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {(['overview', 'questions', 'rubric'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left content area */}
        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <AnimatePresence mode="wait">

            {/* ── Overview Tab ── */}
            {activeTab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

                <div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">Submission Overview & Insights</h2>
                  <p className="text-sm text-slate-500">A high-level summary of performance metrics, sentiment analysis, and verification checks.</p>
                </div>

                {/* Speech Delivery */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Mic className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Speech Delivery</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Filler Words */}
                    <div className="bg-slate-50 rounded-lg p-3">
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                        sm.fillerWords <= 3 ? 'bg-emerald-100 text-emerald-700' : sm.fillerWords <= 8 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {sm.fillerWords <= 3 ? 'Good' : sm.fillerWords <= 8 ? 'Fair' : 'High'}
                      </span>
                      <div className="text-2xl font-bold text-slate-900 mb-0.5">{sm.fillerWords}</div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Filler Words</p>
                      <p className="text-[9px] text-slate-600 leading-tight">Class Avg: 17 — Lower filler use improves clarity.</p>
                    </div>
                    {/* Words/min */}
                    <div className="bg-slate-50 rounded-lg p-3">
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                        sm.wordsPerMin >= 120 && sm.wordsPerMin <= 180 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sm.wordsPerMin >= 120 && sm.wordsPerMin <= 180 ? 'Optimal' : sm.wordsPerMin < 120 ? 'Slow' : 'Fast'}
                      </span>
                      <div className="text-2xl font-bold text-slate-900 mb-0.5">{sm.wordsPerMin}</div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Words/min</p>
                      <p className="text-[9px] text-slate-600 leading-tight">Class Avg: 113 — Ideal range 120–180 for comprehension.</p>
                    </div>
                    {/* Pauses/min */}
                    <div className="bg-slate-50 rounded-lg p-3">
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1 ${
                        sm.pausesPerMin >= 3 && sm.pausesPerMin <= 8 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sm.pausesPerMin >= 3 && sm.pausesPerMin <= 8 ? 'Good' : sm.pausesPerMin > 8 ? 'High' : 'Low'}
                      </span>
                      <div className="text-2xl font-bold text-slate-900 mb-0.5">{sm.pausesPerMin}</div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Pauses/min</p>
                      <p className="text-[9px] text-slate-600 leading-tight">Class Avg: 1.8 — Strategic pauses aid emphasis.</p>
                    </div>
                  </div>
                </div>

                {/* Transcript */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Transcript</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Numbered circles mark key moments — click to see specific feedback.</p>
                    </div>
                    {loading && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                      </div>
                    )}
                    <div className="flex items-center gap-3 ml-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">1</span>
                        <span className="text-[10px] text-slate-500">Strength</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">1</span>
                        <span className="text-[10px] text-slate-500">Improvement</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 max-h-[400px] overflow-y-auto">
                    <div className="space-y-0">
                      {transcript.map((seg, i) => (
                        <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                          <span className="font-mono text-[10px] text-emerald-600 mt-0.5 w-10 flex-shrink-0 text-right">[{i}]</span>
                          <p className="text-xs text-slate-700 leading-relaxed">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Key Observations */}
                {result && (result.strengths.length > 0 || result.improvements.length > 0) && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-900">Key Observations</h3>
                      <p className="text-xs text-slate-500 mt-0.5">The most noteworthy moments from this presentation, grounded in the rubric and course materials.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {result.strengths.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> Strengths
                          </p>
                          {result.strengths.map((s, i) => (
                            <div key={i} className="flex gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-800 leading-relaxed">{s.text}</p>
                                {s.quote && (
                                  <div className="mt-2.5 pt-2.5 border-t border-emerald-200/80">
                                    <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">Transcript quotation</p>
                                    <div className="text-[11px] text-slate-700 italic leading-relaxed border-l-2 border-emerald-300/80 pl-2.5">
                                      &ldquo;{s.quote}&rdquo;
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {result.improvements.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Areas for Improvement
                          </p>
                          {result.improvements.map((s, i) => (
                            <div key={i} className="flex gap-2.5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-800 leading-relaxed">{s.text}</p>
                                {s.quote && (
                                  <div className="mt-2.5 pt-2.5 border-t border-amber-200/80">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Transcript quotation</p>
                                    <div className="text-[11px] text-slate-700 italic leading-relaxed border-l-2 border-amber-300/80 pl-2.5">
                                      &ldquo;{s.quote}&rdquo;
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload CTA — only visible when in demo mode with no upload */}
                {videoMode === 'demo' && (
                  <div className="bg-emerald-800 rounded-2xl p-5 text-white flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold mb-1">Want to try with your own presentation?</p>
                      <p className="text-xs opacity-75 leading-relaxed">Upload a video and get the same AI-powered analysis on your own content.</p>
                    </div>
                    <button onClick={() => setVideoMode('upload')}
                      className="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex-shrink-0 ml-4">
                      <Upload className="w-3.5 h-3.5" /> Upload Video
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Questions Tab ── */}
            {activeTab === 'questions' && (
              <motion.div key="questions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Follow-up Questions</h2>
                  <p className="text-sm text-slate-500">Based on the transcript analysis, these questions test depth of understanding across different cognitive levels.</p>
                </div>

                <div className="space-y-4">
                  {(result?.questions ?? []).map((q, i) => {
                    const cat = getCat(q.category);
                    const seg = transcript[Math.min(i * 2, transcript.length - 1)];
                    const segPreview = seg?.text?.slice(0, 55) ?? '';
                    return (
                      <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        {/* Card header: badge + branch button */}
                        <div className="flex items-center justify-between px-5 pt-4 pb-3">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                            style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>
                            <span>{cat.icon}</span> {cat.label}
                          </span>
                          <button className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 transition-colors">
                            <svg width={12} height={12} viewBox="0 0 12 12" fill="none"><path d="M3 2v4a2 2 0 002 2h4M7 6l2 2-2 2" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/></svg>
                            Branch <svg width={10} height={10} viewBox="0 0 10 10" fill="none" className="ml-0.5"><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                        {/* Question */}
                        <div className="px-5 pb-3">
                          <p className="text-sm text-slate-900 leading-relaxed">{q.question}</p>
                        </div>
                        {/* Context footer */}
                        <div className="px-5 py-3 border-t border-slate-100 flex items-start gap-1.5">
                          <svg width={13} height={13} viewBox="0 0 13 13" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="6.5" cy="6.5" r="5.5" stroke="#94a3b8" strokeWidth={1.2}/><path d="M6.5 4.5v2.5l1.5 1" stroke="#94a3b8" strokeWidth={1.2} strokeLinecap="round"/></svg>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            <span className="font-medium text-slate-500">Context:</span>{' '}
                            Referenced during the {segPreview.toLowerCase()}{segPreview.length >= 55 ? '...' : ''} segment at{' '}
                            <span className="font-mono text-slate-500">[{q.timestamp || '0:00'}]</span>.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Rubric Tab — two-panel layout ── */}
            {activeTab === 'rubric' && (
              <motion.div key="rubric" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex gap-4 items-start">

                  {/* ── Left: criteria list sidebar ── */}
                  <div className="w-56 flex-shrink-0 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                      <h3 className="text-xs font-semibold text-slate-700">Grading Rubric</h3>
                    </div>
                    {/* Total */}
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-slate-900">{result?.overallScore ?? 0}</span>
                        <span className="text-xs text-slate-400">/{result?.maxScore ?? 100}</span>
                        <span className="ml-auto text-[10px] text-slate-400">{result ? Math.round((result.overallScore / result.maxScore) * 100) : 0}%</span>
                      </div>
                      <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${result ? (result.overallScore / result.maxScore) * 100 : 0}%` }} />
                      </div>
                      <p className="mt-1.5 text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Proficiency: {result?.letterGrade ?? 'B+'}
                      </p>
                    </div>
                    {/* Criterion list */}
                    <div className="divide-y divide-slate-50">
                      {(result?.rubric ?? []).map((c, i) => {
                        const pct = c.maxScore > 0 ? c.score / c.maxScore : 0;
                        const barColor = c.status === 'strong' ? '#10b981' : c.status === 'adequate' ? '#f59e0b' : '#ef4444';
                        const isActive = selectedCriterionIdx === i;
                        return (
                          <button key={i} onClick={() => setSelectedCriterionIdx(i)}
                            className={`w-full text-left px-4 py-3 transition-colors ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-slate-800">{c.criterion}</span>
                              <span className="text-[11px] text-slate-500 font-mono">{c.score}/{c.maxScore}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: barColor }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Right: criterion detail + Babblet Insights ── */}
                  {result && result.rubric[selectedCriterionIdx] && (() => {
                    const c = result.rubric[selectedCriterionIdx];
                    const pct = c.maxScore > 0 ? c.score / c.maxScore : 0;
                    const barColor = c.status === 'strong' ? '#10b981' : c.status === 'adequate' ? '#f59e0b' : '#ef4444';
                    const statusLabel = c.status === 'strong' ? 'Excellent' : c.status === 'adequate' ? 'Adequate' : 'Needs Work';
                    const statusTextColor = c.status === 'strong' ? 'text-emerald-600' : c.status === 'adequate' ? 'text-amber-600' : 'text-red-600';
                    return (
                      <div className="flex-1 min-w-0 space-y-4">
                        {/* Criterion header card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-slate-900">{c.criterion}</h3>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-semibold ${statusTextColor}`}>{statusLabel}</span>
                              <span className="text-base font-bold text-slate-900">{c.score}<span className="text-xs text-slate-400 font-normal">/{c.maxScore}</span></span>
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: barColor }} />
                          </div>
                        </div>

                        {/* Babblet Insights card */}
                        {c.insights && (
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Babblet Insights</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button className="text-slate-300 hover:text-slate-500 transition-colors"><svg width={14} height={14} viewBox="0 0 14 14" fill="none"><path d="M3 2h8a1 1 0 011 1v7l-3 2H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth={1.2}/></svg></button>
                                <button className="text-slate-300 hover:text-red-400 transition-colors"><svg width={14} height={14} viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3h4v1M6 7v3M8 7v3M3 4l1 8h6l1-8" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"/></svg></button>
                              </div>
                            </div>
                            <div className="p-5 space-y-5">
                              {/* Overview */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-800 mb-2">Overview</h4>
                                <p className="text-xs text-slate-600 leading-relaxed">{c.insights.overview}</p>
                              </div>
                              {/* What worked well */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-800 mb-2">What worked well:</h4>
                                <div className="space-y-2.5">
                                  {c.insights.strengths.map((s, si) => (
                                    <div key={si} className="flex gap-2">
                                      <span className="text-slate-400 mt-0.5 flex-shrink-0">•</span>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {s.text}
                                        {' '}
                                        {s.refs.map(r => (
                                          <span key={r} className="inline-flex items-center justify-center w-4 h-4 rounded bg-slate-100 text-[9px] font-bold text-slate-500 ml-0.5">{r}</span>
                                        ))}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Areas to develop */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-800 mb-2">Areas to develop:</h4>
                                <div className="space-y-2.5">
                                  {c.insights.improvements.map((s, si) => (
                                    <div key={si} className="flex gap-2">
                                      <span className="text-slate-400 mt-0.5 flex-shrink-0">•</span>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {s.text}
                                        {' '}
                                        {s.refs.map(r => (
                                          <span key={r} className="inline-flex items-center justify-center w-4 h-4 rounded bg-slate-100 text-[9px] font-bold text-slate-500 ml-0.5">{r}</span>
                                        ))}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right sidebar (video panel) ── */}
        <div className="w-[420px] flex-shrink-0 bg-slate-800 text-white flex flex-col h-full sticky top-0">
          {/* Video player */}
          <div className="flex-shrink-0 p-4">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              {videoMode === 'upload' && !uploadedUrl ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
                >
                  <Upload className="w-8 h-8 text-slate-400" />
                  <p className="text-xs text-slate-400">Drop video or click to upload</p>
                  <p className="text-[10px] text-slate-500">MP4, MOV, WebM &middot; Max {MAX_FILE_MB} MB</p>
                  <input ref={fileRef} type="file" accept="video/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                </div>
              ) : (
                <video key={videoSrc} src={videoSrc} controls playsInline className="w-full h-full object-cover" />
              )}
            </div>

            {/* File info */}
            <div className="mt-4">
              <h3 className="font-medium text-sm truncate">
                {videoMode === 'upload' && uploadedName ? uploadedName : 'Babblet2.mov'}
              </h3>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                <span>Uploaded Mar 23, 2026</span>
                <span>&bull;</span>
                <span>{videoMode === 'upload' ? 'Uploaded' : '110.6 MB'}</span>
              </div>
            </div>

            {/* Pacing badge */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">
                <BarChart3 className="w-3 h-3" /> Pacing Good
              </span>
            </div>

            {/* Upload toggle */}
            <div className="flex items-center gap-2 mt-4">
              {(['demo', 'upload'] as const).map(m => (
                <button key={m} onClick={() => { setVideoMode(m); if (m === 'demo') { setResult(DEMO_RESULT); } }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${videoMode === m ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {m === 'demo' ? 'Demo video' : 'Upload your own'}
                </button>
              ))}
            </div>
            {uploadErr && <p className="mt-2 text-xs text-red-400">{uploadErr}</p>}
          </div>

          {/* Score summary in sidebar */}
          {result && (
            <div className="border-t border-slate-700 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Overall Score</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-bold">{result.overallScore}</span>
                    <span className="text-sm text-slate-400">/ {result.maxScore}</span>
                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded">{result.letterGrade}</span>
                  </div>
                </div>
                <ScoreCircle score={result.overallScore} max={result.maxScore} size={56} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mt-3">{result.summary}</p>
            </div>
          )}

          {/* Analyze button (for uploads) */}
          {videoMode === 'upload' && uploadedUrl && !result && (
            <div className="p-4 border-t border-slate-700">
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                  : <><Sparkles className="w-4 h-4" /> Analyze with Babblet</>}
              </button>
              {apiErr && <p className="mt-2 text-xs text-red-400">{apiErr}</p>}
            </div>
          )}

          {/* Book a demo CTA */}
          <div className="mt-auto p-4 border-t border-slate-700">
            <Link href="/contact"
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-sm font-bold rounded-xl transition-colors">
              Book a Demo <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
