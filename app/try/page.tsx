'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Upload, Play, Loader2, CheckCircle,
  MessageSquare, BarChart3, Zap, Star, AlertCircle, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

// ─── Design tokens (mirror homepage) ─────────────────────────────────────────
const S = {
  serif:  { fontFamily: 'var(--font-instrument-serif), Georgia, serif' } as const,
  sans:   { fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' } as const,
  forest: { color: 'var(--bab-forest)' } as const,
  gold:   { color: 'var(--bab-gold)' } as const,
  parch:  { color: 'var(--bab-parchment)' } as const,
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut', delay },
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeadForm {
  name: string;
  institution: string;
  phone: string;
  email: string;
}

interface AnalysisResult {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  delivery: { score: number; feedback: string };
  content:  { score: number; feedback: string };
  structure: { score: number; feedback: string };
}

interface Question {
  question: string;
  category: string;
  rationale: string;
}

type Step = 'form' | 'demo';

const MAX_CREDITS = 5;
const MAX_FILE_MB = 200;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// Rough transcript extraction from video: we just send a placeholder and use
// the filename + metadata. Real transcription would need Deepgram/Whisper.
// For the demo video we use a pre-baked transcript excerpt.
const DEMO_TRANSCRIPT = `Good afternoon everyone. My name is Sarah Chen and today I will be presenting my analysis of occupational therapy interventions for post-stroke rehabilitation. I will cover the SOAP note documentation, the discharge summary, and evidence-based justification for the skilled services provided.

Beginning with the subjective section of my SOAP note. The client is a 67-year-old male who presents to outpatient occupational therapy following a left hemisphere ischemic stroke six weeks ago. He reports increased confidence in self-care activities over the past two weeks, stating that therapy has helped him regain independence. His primary concern remains difficulty with fine motor tasks, particularly buttoning shirts and handling utensils.

In the objective section, the client completed upper body dressing with minimal assistance, requiring verbal reminders for safety including brake locking and proper sequencing. He demonstrated contact guard assistance for transfers from bed to wheelchair. Grip strength measured at 12 pounds on the right, non-dominant hand, compared to 38 pounds on the left. His living situation includes a single story home with steps at the entrance and limited community mobility due to geographic isolation.

The assessment indicates the client demonstrates neuroplastic recovery consistent with post-stroke rehabilitation trajectory. He shows expressive aphasia and reduced executive functioning that impact occupational performance. Progress is noted in motor recovery though cognitive-communicative deficits continue to affect his functional independence in instrumental activities of daily living.

For the plan, therapy will continue two times per week focusing on ADL training, compensatory strategy development, and caregiver education. Discharge criteria include independence in morning self-care routine and safe community ambulation. We will reassess discharge planning at the four-week mark.

Regarding the discharge summary, the client has achieved improved independence in basic ADLs and demonstrates understanding of compensatory techniques. Improvements in dressing and transfers indicate effective motor relearning. Discharge to home with home health follow-up is recommended once optimal recovery has been achieved.

The justification for skilled services is grounded in current evidence supporting task-specific training for upper extremity recovery post-stroke. Occupational therapy interventions addressed ADLs, cognition, and environmental modification consistent with best practice guidelines. The skilled nature of these services is evidenced by the complex clinical reasoning required to address this client's multifaceted presentation.

Thank you for your attention. I am happy to answer any questions.`;

// ─── Credit pill ──────────────────────────────────────────────────────────────
function CreditPill({ credits }: { credits: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: credits > 1 ? 'rgba(26,58,42,0.08)' : 'rgba(196,137,42,0.12)',
      borderRadius: 999, padding: '4px 12px 4px 8px',
      border: `1px solid ${credits > 1 ? 'rgba(26,58,42,0.15)' : 'rgba(196,137,42,0.3)'}`,
    }}>
      <Zap size={12} color={credits > 1 ? 'var(--bab-forest)' : 'var(--bab-gold)'} />
      <span style={{ ...S.sans, fontSize: '0.75rem', fontWeight: 600, color: credits > 1 ? 'var(--bab-forest)' : 'var(--bab-gold)' }}>
        {credits} / {MAX_CREDITS} credits remaining
      </span>
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#4A6741' : score >= 55 ? '#C4892A' : '#b45309';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={70} height={70} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={35} cy={35} r={r} fill="none" stroke="rgba(26,58,42,0.08)" strokeWidth={5} />
        <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        <text x={35} y={35} textAnchor="middle" dominantBaseline="central"
          style={{ ...S.sans, fontSize: '1rem', fontWeight: 700, fill: color, transform: 'rotate(90deg)', transformOrigin: '35px 35px' }}>
          {score}
        </text>
      </svg>
      <span style={{ ...S.sans, fontSize: '0.7rem', fontWeight: 600, color: 'var(--bab-forest)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
}

// ─── Lead capture form ────────────────────────────────────────────────────────
function LeadForm({ onSubmit }: { onSubmit: (f: LeadForm) => void }) {
  const [form, setForm] = useState<LeadForm>({ name: '', institution: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Partial<LeadForm>>({});

  const validate = () => {
    const e: Partial<LeadForm> = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.institution.trim()) e.institution = 'Required';
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'Valid email required';
    return e;
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  };

  const field = (key: keyof LeadForm, label: string, type = 'text', placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ ...S.sans, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--bab-forest)', opacity: 0.8 }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => { setForm(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: undefined })); }}
        placeholder={placeholder}
        style={{
          ...S.sans, fontSize: '0.9rem', color: 'var(--bab-forest)',
          background: 'var(--bab-white)', border: `1.5px solid ${errors[key] ? '#ef4444' : 'var(--bab-border)'}`,
          borderRadius: 6, padding: '10px 14px', outline: 'none', width: '100%', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--bab-forest)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = errors[key] ? '#ef4444' : 'var(--bab-border)'; }}
      />
      {errors[key] && <span style={{ ...S.sans, fontSize: '0.75rem', color: '#ef4444' }}>{errors[key]}</span>}
    </div>
  );

  return (
    <motion.div {...fadeUp()} style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {field('name', 'Full name', 'text', 'Dr. Jane Smith')}
        {field('institution', 'Institution', 'text', 'University of...')}
        {field('phone', 'Phone number (optional)', 'tel', '+1 (555) 000-0000')}
        {field('email', 'Work email', 'email', 'you@university.edu')}

        <p style={{ ...S.sans, fontSize: '0.75rem', color: 'var(--bab-forest)', opacity: 0.45, margin: 0, lineHeight: 1.6 }}>
          You get {MAX_CREDITS} free AI credits to explore Babblet. No credit card required.
        </p>

        <button
          type="submit"
          style={{
            ...S.sans, ...S.parch, background: 'var(--bab-forest)', fontWeight: 600,
            fontSize: '0.9375rem', borderRadius: 6, padding: '12px 24px', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,58,42,0.22)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
        >
          Try it out <ArrowRight size={16} />
        </button>
      </form>
    </motion.div>
  );
}

// ─── Demo workspace ───────────────────────────────────────────────────────────
function DemoWorkspace({ lead }: { lead: LeadForm }) {
  const [credits, setCredits] = useState(MAX_CREDITS);
  const [videoMode, setVideoMode] = useState<'demo' | 'upload'>('demo');
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [transcript, setTranscript] = useState(DEMO_TRANSCRIPT);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState<'analyze' | 'questions' | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'questions'>('overview');
  const fileRef = useRef<HTMLInputElement>(null);

  const videoSrc = videoMode === 'upload' && uploadedUrl ? uploadedUrl : '/demo/demo-presentation.mp4';

  const handleUpload = useCallback((file: File) => {
    setUploadError('');
    if (!file.type.startsWith('video/')) {
      setUploadError('Please upload a video file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`File too large. Max ${MAX_FILE_MB} MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedUrl(url);
    setUploadedName(file.name);
    setVideoMode('upload');
    // For uploaded videos, use a generic placeholder transcript
    setTranscript(`[Transcript from "${file.name}"] — This is a student presentation video uploaded for analysis. The AI will evaluate the content based on academic presentation standards including clarity, structure, evidence, and delivery.`);
    setAnalysis(null);
    setQuestions(null);
  }, []);

  const callApi = async (action: 'analyze' | 'questions') => {
    setError('');
    setLoading(action);
    try {
      const res = await fetch('/api/try', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, email: lead.email, transcript }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed.'); return; }
      if (data.creditsRemaining !== undefined) setCredits(data.creditsRemaining);
      if (action === 'analyze') { setAnalysis(data.result); setActiveTab('overview'); }
      if (action === 'questions') { setQuestions(data.result); setActiveTab('questions'); }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const catColor = (c: string) => ({
    clarification: { bg: 'rgba(59,130,246,0.08)', text: '#1d4ed8', border: 'rgba(59,130,246,0.2)' },
    depth:         { bg: 'rgba(139,92,246,0.08)', text: '#6d28d9', border: 'rgba(139,92,246,0.2)' },
    evidence:      { bg: 'rgba(20,184,166,0.08)', text: '#0f766e', border: 'rgba(20,184,166,0.2)' },
    application:   { bg: 'rgba(249,115,22,0.08)', text: '#c2410c', border: 'rgba(249,115,22,0.2)' },
  }[c] || { bg: 'rgba(26,58,42,0.06)', text: 'var(--bab-forest)', border: 'var(--bab-border)' });

  return (
    <motion.div {...fadeUp()} style={{ width: '100%' }}>
      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ ...S.sans, fontSize: '0.8125rem', color: 'var(--bab-forest)', opacity: 0.6, margin: 0 }}>
            Welcome, <strong style={{ opacity: 1 }}>{lead.name}</strong>
          </p>
        </div>
        <CreditPill credits={credits} />
      </div>

      {/* ── Video + controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>

        {/* Left — video */}
        <div>
          {/* Video toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['demo', 'upload'] as const).map(m => (
              <button key={m} onClick={() => setVideoMode(m)}
                style={{
                  ...S.sans, fontSize: '0.8rem', fontWeight: 600, padding: '5px 14px',
                  borderRadius: 999, border: '1.5px solid var(--bab-border)', cursor: 'pointer',
                  background: videoMode === m ? 'var(--bab-forest)' : 'transparent',
                  color: videoMode === m ? 'var(--bab-parchment)' : 'var(--bab-forest)',
                  transition: 'all 0.15s',
                }}>
                {m === 'demo' ? 'Demo video' : 'Upload your own'}
              </button>
            ))}
          </div>

          {/* Upload drop zone */}
          {videoMode === 'upload' && !uploadedUrl && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              style={{
                aspectRatio: '16/9', border: '2px dashed var(--bab-border)', borderRadius: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 12, cursor: 'pointer', background: 'rgba(26,58,42,0.03)', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,58,42,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,58,42,0.03)'; }}
            >
              <Upload size={28} color="var(--bab-forest)" style={{ opacity: 0.4 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ ...S.sans, fontWeight: 600, fontSize: '0.875rem', color: 'var(--bab-forest)', margin: '0 0 4px' }}>
                  Drop a video here
                </p>
                <p style={{ ...S.sans, fontSize: '0.75rem', color: 'var(--bab-forest)', opacity: 0.5, margin: 0 }}>
                  MP4, MOV, WebM · Max {MAX_FILE_MB} MB
                </p>
              </div>
              <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
          )}

          {uploadError && (
            <p style={{ ...S.sans, fontSize: '0.8rem', color: '#ef4444', marginTop: 8 }}>{uploadError}</p>
          )}

          {/* Video player */}
          {(videoMode === 'demo' || uploadedUrl) && (
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bab-border)', background: '#000' }}>
              <video
                key={videoSrc}
                src={videoSrc}
                controls
                playsInline
                style={{ width: '100%', aspectRatio: '16/9', display: 'block' }}
              />
              {videoMode === 'upload' && uploadedName && (
                <div style={{ padding: '8px 12px', background: 'var(--bab-parchment)', borderTop: '1px solid var(--bab-border)' }}>
                  <p style={{ ...S.sans, fontSize: '0.75rem', color: 'var(--bab-forest)', opacity: 0.6, margin: 0 }}>
                    📎 {uploadedName}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => callApi('analyze')}
              disabled={loading !== null || credits <= 0}
              style={{
                ...S.sans, fontWeight: 600, fontSize: '0.875rem', padding: '10px 20px',
                borderRadius: 6, border: 'none', cursor: loading !== null || credits <= 0 ? 'not-allowed' : 'pointer',
                background: loading !== null || credits <= 0 ? 'rgba(26,58,42,0.15)' : 'var(--bab-forest)',
                color: loading !== null || credits <= 0 ? 'rgba(26,58,42,0.4)' : 'var(--bab-parchment)',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
              }}
            >
              {loading === 'analyze' ? <Loader2 size={15} className="animate-spin" /> : <BarChart3 size={15} />}
              Analyze presentation
            </button>
            <button
              onClick={() => callApi('questions')}
              disabled={loading !== null || credits <= 0}
              style={{
                ...S.sans, fontWeight: 500, fontSize: '0.875rem', padding: '10px 20px',
                borderRadius: 6, cursor: loading !== null || credits <= 0 ? 'not-allowed' : 'pointer',
                border: '1.5px solid var(--bab-border)',
                background: 'transparent',
                color: loading !== null || credits <= 0 ? 'rgba(26,58,42,0.3)' : 'var(--bab-forest)',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
              }}
            >
              {loading === 'questions' ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
              Generate questions
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
              <AlertCircle size={14} color="#ef4444" />
              <p style={{ ...S.sans, fontSize: '0.8rem', color: '#ef4444', margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Right — results panel */}
        <div style={{ background: 'var(--bab-white)', borderRadius: 10, border: '1px solid var(--bab-border)', overflow: 'hidden', minHeight: 360 }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bab-border)' }}>
            {(['overview', 'questions'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{
                  ...S.sans, flex: 1, padding: '11px 0', fontSize: '0.8125rem', fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  borderBottom: `2px solid ${activeTab === t ? 'var(--bab-forest)' : 'transparent'}`,
                  background: activeTab === t ? 'rgba(26,58,42,0.04)' : 'transparent',
                  color: activeTab === t ? 'var(--bab-forest)' : 'rgba(26,58,42,0.45)',
                }}>
                {t === 'overview' ? 'Overview' : 'Questions'}
              </button>
            ))}
          </div>

          <div style={{ padding: 18, overflowY: 'auto', maxHeight: 560 }}>
            <AnimatePresence mode="wait">

              {/* Overview tab */}
              {activeTab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  {!analysis && !loading && (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <BarChart3 size={32} color="var(--bab-forest)" style={{ opacity: 0.18, marginBottom: 12 }} />
                      <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', opacity: 0.45, margin: 0 }}>
                        Click "Analyze presentation" to generate AI feedback
                      </p>
                    </div>
                  )}
                  {loading === 'analyze' && (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <Loader2 size={28} color="var(--bab-forest)" className="animate-spin" style={{ marginBottom: 12 }} />
                      <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', opacity: 0.5, margin: 0 }}>
                        Analyzing presentation…
                      </p>
                    </div>
                  )}
                  {analysis && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {/* Scores */}
                      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 0', borderBottom: '1px solid var(--bab-border)' }}>
                        <ScoreRing score={analysis.overallScore} label="Overall" />
                        <ScoreRing score={analysis.content.score} label="Content" />
                        <ScoreRing score={analysis.delivery.score} label="Delivery" />
                        <ScoreRing score={analysis.structure.score} label="Structure" />
                      </div>

                      {/* Summary */}
                      <div>
                        <p style={{ ...S.sans, fontSize: '0.78rem', fontWeight: 700, color: 'var(--bab-forest)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Summary</p>
                        <p style={{ ...S.sans, fontSize: '0.8125rem', color: 'var(--bab-forest)', lineHeight: 1.65, margin: 0 }}>{analysis.summary}</p>
                      </div>

                      {/* Strengths */}
                      <div>
                        <p style={{ ...S.sans, fontSize: '0.78rem', fontWeight: 700, color: '#4A6741', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Strengths</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {analysis.strengths.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <CheckCircle size={13} color="#4A6741" style={{ flexShrink: 0, marginTop: 2 }} />
                              <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', margin: 0, lineHeight: 1.55 }}>{s}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Improvements */}
                      <div>
                        <p style={{ ...S.sans, fontSize: '0.78rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Areas to improve</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {analysis.improvements.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <ChevronRight size={13} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
                              <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', margin: 0, lineHeight: 1.55 }}>{s}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Questions tab */}
              {activeTab === 'questions' && (
                <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  {!questions && !loading && (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <MessageSquare size={32} color="var(--bab-forest)" style={{ opacity: 0.18, marginBottom: 12 }} />
                      <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', opacity: 0.45, margin: 0 }}>
                        Click "Generate questions" to create targeted follow-up questions
                      </p>
                    </div>
                  )}
                  {loading === 'questions' && (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <Loader2 size={28} color="var(--bab-forest)" className="animate-spin" style={{ marginBottom: 12 }} />
                      <p style={{ ...S.sans, fontSize: '0.8rem', color: 'var(--bab-forest)', opacity: 0.5, margin: 0 }}>
                        Generating questions…
                      </p>
                    </div>
                  )}
                  {questions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {questions.map((q, i) => {
                        const c = catColor(q.category);
                        return (
                          <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--bab-border)', background: 'var(--bab-parchment)' }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                              <span style={{
                                ...S.sans, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 999,
                                background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                                flexShrink: 0, marginTop: 1,
                              }}>
                                {q.category}
                              </span>
                              <p style={{ ...S.sans, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--bab-forest)', margin: 0, lineHeight: 1.5 }}>
                                {q.question}
                              </p>
                            </div>
                            <p style={{ ...S.sans, fontSize: '0.75rem', color: 'var(--bab-forest)', opacity: 0.5, margin: 0, lineHeight: 1.5 }}>
                              {q.rationale}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Upsell ── */}
      {credits <= 2 && (
        <motion.div {...fadeUp(0.1)} style={{
          marginTop: 24, padding: '18px 24px', borderRadius: 10,
          background: 'var(--bab-forest)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ ...S.sans, ...S.parch, fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 4px' }}>
              {credits === 0 ? 'Credits used up' : `${credits} credit${credits === 1 ? '' : 's'} left`}
            </p>
            <p style={{ ...S.sans, ...S.parch, fontSize: '0.8125rem', margin: 0, opacity: 0.65 }}>
              Get unlimited grading, rubric uploads, class management, and more.
            </p>
          </div>
          <Link href="/contact"
            style={{
              ...S.sans, fontWeight: 600, fontSize: '0.875rem', borderRadius: 6,
              padding: '10px 22px', textDecoration: 'none', whiteSpace: 'nowrap',
              background: 'var(--bab-gold)', color: 'var(--bab-dark)', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            Book a Demo <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </Link>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TryPage() {
  const [step, setStep] = useState<Step>('form');
  const [lead, setLead] = useState<LeadForm | null>(null);

  const handleFormSubmit = (f: LeadForm) => {
    setLead(f);
    setStep('demo');
  };

  return (
    <div style={{ background: 'var(--bab-parchment)', minHeight: '100vh', ...S.sans }}>
      {/* Navbar */}
      <header style={{ background: 'var(--bab-parchment)', borderBottom: '1px solid var(--bab-border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ ...S.serif, ...S.forest, fontSize: '1.25rem', fontWeight: 400, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeft size={16} style={{ opacity: 0.5 }} /> Babblet
          </Link>
          <Link href="/contact"
            style={{ ...S.parch, ...S.sans, background: 'var(--bab-forest)', fontSize: '0.875rem', fontWeight: 600, borderRadius: 4, padding: '8px 18px', textDecoration: 'none' }}>
            Book a Demo
          </Link>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: step === 'demo' ? 1160 : 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: 'center' }}>
              {/* Header */}
              <motion.div {...fadeUp(0)} style={{ marginBottom: 40 }}>
                <span style={{ ...S.gold, ...S.sans, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 14 }}>
                  Free Trial
                </span>
                <h1 style={{ ...S.serif, ...S.forest, fontSize: 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 400, lineHeight: 1.15, margin: '0 0 16px' }}>
                  See Babblet in action,<br /><em>on your terms.</em>
                </h1>
                <p style={{ ...S.sans, ...S.forest, fontSize: '1rem', lineHeight: 1.65, margin: '0 auto', maxWidth: 420, opacity: 0.62 }}>
                  Watch a real OT presentation get analyzed by AI — or upload your own. You get {MAX_CREDITS} free credits to explore.
                </p>
              </motion.div>

              {/* What you'll see chips */}
              <motion.div {...fadeUp(0.08)} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 36 }}>
                {[
                  { icon: BarChart3, label: 'Performance scores' },
                  { icon: Star,      label: 'Strengths & gaps' },
                  { icon: MessageSquare, label: 'Follow-up questions' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px',
                    borderRadius: 999, border: '1px solid var(--bab-border)', background: 'var(--bab-white)',
                  }}>
                    <Icon size={13} color="var(--bab-forest)" />
                    <span style={{ ...S.sans, fontSize: '0.8125rem', fontWeight: 500, color: 'var(--bab-forest)' }}>{label}</span>
                  </div>
                ))}
              </motion.div>

              <motion.div {...fadeUp(0.12)}>
                <LeadForm onSubmit={handleFormSubmit} />
              </motion.div>
            </motion.div>
          )}

          {step === 'demo' && lead && (
            <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DemoWorkspace lead={lead} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
