'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, X,
  BookOpen, MessageSquare, BarChart3, Award,
  Upload, Zap, CheckSquare, Send,
} from 'lucide-react';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────────────────
   FeatureVideo — unchanged from original (Chrome muted-property fix)
───────────────────────────────────────────────────────────────────────────── */
function FeatureVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let playing = false;

    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.className = 'w-full h-auto block';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (poster) video.poster = poster;
    if (alt) video.setAttribute('aria-label', alt);
    container.appendChild(video);

    const tryPlay = () => {
      if (playing || !video.paused) return;
      video.play()
        .then(() => { playing = true; })
        .catch(() => {});
    };

    video.addEventListener('canplay', tryPlay, { once: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) tryPlay();
      },
      { threshold: [0, 0.5, 1], rootMargin: '0px' },
    );
    observer.observe(video);

    const onGesture = () => {
      document.querySelectorAll('video').forEach(v => {
        if (v.paused && v.muted) v.play().catch(() => {});
      });
    };
    window.addEventListener('scroll', onGesture, { once: true, passive: true });
    window.addEventListener('click', onGesture, { once: true });
    window.addEventListener('touchstart', onGesture, { once: true, passive: true });

    const t = setTimeout(tryPlay, 800);

    return () => {
      observer.disconnect();
      clearTimeout(t);
      video.pause();
      container.removeChild(video);
    };
  }, [src, poster, alt]);

  return <div ref={containerRef} className="w-full overflow-hidden" style={{ minHeight: 0 }} />;
}


/* ─────────────────────────────────────────────────────────────────────────────
   ExpandableVideo — wraps FeatureVideo with click-to-expand lightbox
───────────────────────────────────────────────────────────────────────────── */
function ExpandableVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const [expanded, setExpanded] = useState(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const handleOpen = (e: React.MouseEvent) => {
    const pt = pointerRef.current;
    pointerRef.current = null;
    if (!pt) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    if (dx * dx + dy * dy <= 100) setExpanded(true);
  };

  return (
    <>
      <div
        style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
        onPointerDown={e => { pointerRef.current = { x: e.clientX, y: e.clientY }; }}
        onPointerLeave={() => { pointerRef.current = null; }}
        onClick={handleOpen}
        title="Click to expand"
      >
        <FeatureVideo src={src} poster={poster} alt={alt} />
        {/* Expand hint */}
        <div style={{
          position: 'absolute', bottom: 10, right: 10,
          background: 'rgba(26,58,42,0.75)', borderRadius: 6, padding: '4px 8px',
          display: 'flex', alignItems: 'center', gap: 4,
          opacity: 0, transition: 'opacity 0.2s',
          pointerEvents: 'none',
        }} className="expand-hint">
          <ArrowRight size={12} color="#F7F5F0" />
          <span style={{ color: '#F7F5F0', fontSize: '0.7rem', fontWeight: 600 }}>Expand</span>
        </div>
      </div>

      {/* Lightbox — true full-screen with gray overlay */}
      {expanded && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(30,30,30,0.92)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={() => setExpanded(false)}
        >
          {/* Close button top-right */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', flexShrink: 0 }}>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%', width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
            >
              <X size={18} color="#ffffff" />
            </button>
          </div>
          {/* Video fills remaining space */}
          <div
            style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px 32px' }}
            onClick={e => e.stopPropagation()}
          >
            <video
              src={src}
              poster={poster}
              aria-label={alt}
              autoPlay muted loop playsInline
              style={{ width: '100%', maxHeight: 'calc(100vh - 100px)', objectFit: 'contain', borderRadius: 8, background: '#000' }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Feature data — original videos + order preserved, icons/nums added
───────────────────────────────────────────────────────────────────────────── */
const SHOWCASE_FEATURES = [
  {
    num: '01', icon: BookOpen,
    title: 'Course & Assignment Setup',
    description: 'Create courses, attach rubrics, and upload student videos in just a few clicks. Babblet handles transcription, analysis, and scoring automatically so you can focus on the feedback that matters.',
    image: '/features/feature-courses.png',
    video: '/features/feature-courses.mp4',
    alt: 'Creating a course and setting up an assignment with rubric and video uploads',
  },
  {
    num: '02', icon: MessageSquare,
    title: 'Targeted Follow-Up Questions',
    description: "Babblet automatically generates targeted follow-up questions based on each student's transcript. Questions are categorized by cognitive level and linked directly to specific moments in the presentation.",
    image: '/features/feature-questions.png',
    video: '/features/feature-questions.mp4',
    alt: 'Follow-up questions interface showing categorized questions with branch functionality',
  },
  {
    num: '03', icon: BarChart3,
    title: 'Performance Overview & Insights',
    description: "Get a high-level snapshot of every submission at a glance. The overview surfaces performance scores, sentiment analysis, speech delivery metrics, and Babblet-identified spotlight moments.",
    image: '/features/feature-overview.png',
    video: '/features/feature-overview.mp4',
    alt: 'Submission overview showing performance score, speech metrics, and evidence mapping',
  },
  {
    num: '04', icon: Award,
    title: 'Criterion-Level Rubric Grading',
    description: "Each submission is evaluated against your exact rubric criteria with per-criterion scores, detailed feedback, and Babblet Insights that explain what worked, what didn't, and why.",
    image: '/features/feature-rubric.png',
    video: '/features/feature-rubric.mp4',
    alt: 'Grading rubric interface with per-criterion scoring and Babblet-generated insights',
  },
];

const HOW_IT_WORKS = [
  { num: '01', icon: Upload,       title: 'Upload rubric & student videos',    desc: 'Add your grading rubric and upload student presentation videos in any format.' },
  { num: '02', icon: Zap,          title: 'Babblet transcribes & analyzes',    desc: 'Our agentic AI transcribes presentations and evaluates every criterion automatically.' },
  { num: '03', icon: CheckSquare,  title: 'Review grades & feedback',          desc: 'Inspect per-criterion scores, transcript citations, and AI-generated insights.' },
  { num: '04', icon: Send,         title: 'Deliver to students',               desc: 'Export polished feedback reports and finalize grades with a single click.' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Shared motion preset
───────────────────────────────────────────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: 'easeOut', delay },
});

/* ─────────────────────────────────────────────────────────────────────────────
   Inline styles using CSS variables
───────────────────────────────────────────────────────────────────────────── */
const S = {
  serif:   { fontFamily: 'var(--font-instrument-serif), Georgia, serif' },
  sans:    { fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  forest:  { color: 'var(--bab-forest)' },
  gold:    { color: 'var(--bab-gold)' },
  parch:   { color: 'var(--bab-parchment)' },
  border:  { border: '1px solid var(--bab-border)' },
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div style={{ background: 'var(--bab-parchment)', ...S.sans }}>

      {/* ═══════════════════════════════════════════════════════════════════
          NAVBAR
      ═════════════════════════════════════════════════════════════════════ */}
      <header style={{ background: 'var(--bab-parchment)', borderBottom: '1px solid var(--bab-border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ ...S.serif, ...S.forest, fontSize: '1.375rem', fontWeight: 400 }}>Babblet</span>
          </Link>

          {/* Nav links */}
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }} className="hidden md:flex">
            {[['Features', '#features'], ['About', '/about'], ['Contact', '/contact']].map(([label, href]) => (
              <Link key={label} href={href}
                style={{ ...S.forest, ...S.sans, fontSize: '0.875rem', fontWeight: 400, opacity: 0.6, textDecoration: 'none', transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}>
                {label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/login"
              style={{ ...S.forest, ...S.sans, fontSize: '0.875rem', fontWeight: 500, borderRadius: 4, padding: '7px 16px', textDecoration: 'none', border: '1px solid var(--bab-border)', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              Login
            </Link>
            <Link href="/contact"
              style={{ ...S.parch, ...S.sans, background: 'var(--bab-forest)', fontSize: '0.875rem', fontWeight: 600, borderRadius: 4, padding: '8px 18px', textDecoration: 'none', transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Book a Demo
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO
      ═════════════════════════════════════════════════════════════════════ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '96px 24px 80px', textAlign: 'center' }}>
        <div>
          <motion.div {...fadeUp(0)} style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            {/* Gold badge */}
            <div style={{ display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 8, background: 'rgba(196,137,42,0.1)', border: '1px solid rgba(196,137,42,0.28)', borderRadius: 999, padding: '5px 14px' }}>
              <span style={{ ...S.gold, ...S.sans, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Agentic AI for Education
              </span>
            </div>

            {/* H1 */}
            <h1 style={{ ...S.serif, ...S.forest, fontSize: 'clamp(2.5rem, 5vw, 3.75rem)', lineHeight: 1.08, fontWeight: 400, margin: 0 }}>
              Grade presentations<br />
              <em style={{ fontStyle: 'italic' }}>at scale.</em>
            </h1>

            {/* Subline */}
            <p style={{ ...S.sans, ...S.forest, fontSize: '1rem', fontWeight: 700, lineHeight: 1.5, margin: 0 }}>
              The TA your faculty need to scale learning.
            </p>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
              <Link href="/contact"
                style={{ ...S.parch, ...S.sans, background: 'var(--bab-forest)', fontWeight: 600, fontSize: '0.9375rem', borderRadius: 4, padding: '12px 26px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,58,42,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                Book a Demo
              </Link>
              <a href="#features"
                style={{ ...S.forest, ...S.sans, fontWeight: 500, fontSize: '0.9375rem', border: '1.5px solid var(--bab-border)', borderRadius: 4, padding: '11px 26px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.7)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; }}>
                See it in action <ArrowRight size={14} />
              </a>
            </div>

          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURES  (white bg, 2×2 grid)
      ═════════════════════════════════════════════════════════════════════ */}
      <section id="features" style={{ background: 'var(--bab-white)', padding: '96px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>

          {/* Section header */}
          <motion.div {...fadeUp()} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ ...S.gold, ...S.sans, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 14 }}>
              What Babblet Does
            </span>
            <h2 style={{ ...S.serif, ...S.forest, fontSize: 'clamp(1.875rem, 4vw, 2.75rem)', fontWeight: 400, lineHeight: 1.2, margin: 0 }}>
              Every feature built to save time,<br />
              <em style={{ fontStyle: 'italic' }}>not add steps.</em>
            </h2>
          </motion.div>

          {/* 2×2 grid — all 4 feature videos preserved in original order */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 24 }}>
            {SHOWCASE_FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} {...fadeUp(idx * 0.08)}>
                  <div
                    style={{ background: 'var(--bab-parchment)', borderRadius: 12, border: '1px solid var(--bab-border)', overflow: 'hidden', transition: 'transform 0.22s ease, box-shadow 0.22s ease', height: '100%', display: 'flex', flexDirection: 'column' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 36px rgba(26,58,42,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}>

                    {/* Card header */}
                    <div style={{ padding: '28px 28px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span style={{ ...S.serif, ...S.forest, fontSize: '4rem', fontStyle: 'italic', opacity: 0.07, lineHeight: 1, fontWeight: 400, userSelect: 'none' }}>
                          {feature.num}
                        </span>
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bab-forest-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={18} color="var(--bab-forest)" />
                        </div>
                      </div>
                      <h3 style={{ ...S.serif, ...S.forest, fontSize: '1.375rem', fontWeight: 400, margin: '0 0 10px', lineHeight: 1.3 }}>
                        {feature.title}
                      </h3>
                      <p style={{ ...S.sans, ...S.forest, fontSize: '0.875rem', lineHeight: 1.7, margin: 0, opacity: 0.62 }}>
                        {feature.description}
                      </p>
                    </div>

                    {/* Feature video — stable aspect box to prevent flash when partially in view */}
                    <div style={{ borderTop: '1px solid var(--bab-border)', background: 'var(--bab-white)', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <div style={{ aspectRatio: '16/9', overflow: 'hidden' }}>
                        <ExpandableVideo src={feature.video} poster={feature.image} alt={feature.alt} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          HOW IT WORKS  (forest green bg)
      ═════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--bab-forest)', padding: '96px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>

          <motion.div {...fadeUp()} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ ...S.gold, ...S.sans, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 14 }}>
              How It Works
            </span>
            <h2 style={{ ...S.serif, ...S.parch, fontSize: 'clamp(1.875rem, 4vw, 2.75rem)', fontWeight: 400, lineHeight: 1.2, margin: 0 }}>
              From upload to feedback<br />
              <em style={{ fontStyle: 'italic' }}>in minutes, not hours.</em>
            </h2>
          </motion.div>

          {/* Steps */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, position: 'relative' }}>
            {/* Connector line (decorative) */}
            <div style={{ position: 'absolute', top: 28, left: '10%', right: '10%', height: 1, background: 'rgba(247,245,240,0.12)', pointerEvents: 'none' }} className="hidden lg:block" />

            {HOW_IT_WORKS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div key={step.num} {...fadeUp(idx * 0.1)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                  {/* Circle */}
                  <div style={{ width: 56, height: 56, borderRadius: '50%', border: '1.5px solid rgba(196,137,42,0.35)', background: 'rgba(196,137,42,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, flexShrink: 0 }}>
                    <Icon size={20} color="var(--bab-gold)" />
                  </div>
                  <div>
                    <span style={{ ...S.sans, ...S.gold, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                      Step {step.num}
                    </span>
                    <h3 style={{ ...S.sans, ...S.parch, fontWeight: 600, fontSize: '0.9375rem', margin: '0 0 8px', lineHeight: 1.4 }}>
                      {step.title}
                    </h3>
                    <p style={{ ...S.sans, ...S.parch, fontSize: '0.8125rem', lineHeight: 1.7, margin: 0, opacity: 0.52 }}>
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CTA  (gold-tinted bg)
      ═════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'var(--bab-gold-bg)', padding: '96px 0' }}>
        <motion.div {...fadeUp()} style={{ maxWidth: 620, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ ...S.serif, ...S.forest, fontSize: 'clamp(2rem, 4vw, 3.25rem)', fontWeight: 400, lineHeight: 1.15, margin: '0 0 20px' }}>
            Reclaim your<br /><em style={{ fontStyle: 'italic' }}>grading hours.</em>
          </h2>
          <p style={{ ...S.sans, ...S.forest, fontSize: '1.0625rem', lineHeight: 1.65, margin: '0 0 36px', opacity: 0.62 }}>
            Join programs that have already reclaimed hundreds of hours with Babblet&apos;s agentic grading platform.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/contact"
              style={{ ...S.parch, ...S.sans, background: 'var(--bab-forest)', fontWeight: 600, fontSize: '0.9375rem', borderRadius: 4, padding: '13px 30px', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,58,42,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              Book a Demo
            </Link>
            <Link href="/contact"
              style={{ ...S.forest, ...S.sans, fontWeight: 500, fontSize: '0.9375rem', border: '1.5px solid rgba(26,58,42,0.25)', borderRadius: 4, padding: '12px 30px', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; }}>
              Talk to the team
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER  (dark bg)
      ═════════════════════════════════════════════════════════════════════ */}
      <footer style={{ background: 'var(--bab-dark)', padding: '48px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <span style={{ ...S.serif, ...S.parch, fontSize: '1.25rem', fontWeight: 400 }}>Babblet</span>
          <p style={{ ...S.sans, ...S.parch, fontSize: '0.8rem', margin: 0, opacity: 0.35 }}>
            © 2026 Babblet Inc. All rights reserved.
          </p>
          <nav style={{ display: 'flex', gap: 24 }}>
            {[['Features', '#features'], ['About', '/about'], ['Contact', '/contact']].map(([label, href]) => (
              <Link key={label} href={href}
                style={{ ...S.sans, ...S.parch, fontSize: '0.8125rem', opacity: 0.45, textDecoration: 'none', transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

    </div>
  );
}
