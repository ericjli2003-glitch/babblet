'use client';

import { Fragment, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Video that reliably autoplays in Chrome.
 *
 * React has a long-standing bug where it sets the HTML `muted` *attribute*
 * (via `defaultMuted`) but never the DOM `.muted` *property*. Chrome's
 * autoplay policy checks the **property**, sees it as `false`, and blocks
 * playback.  We bypass React entirely by creating the <video> element
 * with the native DOM API so `.muted = true` is set before the browser
 * ever evaluates autoplay.
 */
function FeatureVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Build the <video> element outside of React
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;           // DOM property — the one Chrome actually checks
    video.defaultMuted = true;    // HTML attribute mirror
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.className = 'w-full h-auto block';
    video.setAttribute('playsinline', '');   // iOS Safari needs the attribute too
    video.setAttribute('webkit-playsinline', '');
    if (poster) video.poster = poster;
    if (alt) video.setAttribute('aria-label', alt);

    container.appendChild(video);

    // Retry helper
    const tryPlay = () => {
      if (video.paused) video.play().catch(() => {});
    };

    // Play as soon as enough data is buffered
    video.addEventListener('canplay', tryPlay);

    // Play when scrolled into view
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) tryPlay(); },
      { threshold: 0.1 },
    );
    observer.observe(video);

    // Fallback: play on first user gesture
    const onGesture = () => {
      document.querySelectorAll('video').forEach((v) => {
        if (v.paused && v.muted) v.play().catch(() => {});
      });
    };
    window.addEventListener('scroll', onGesture, { once: true, passive: true });
    window.addEventListener('click', onGesture, { once: true });
    window.addEventListener('touchstart', onGesture, { once: true, passive: true });

    // Extra delayed attempt
    const t = setTimeout(tryPlay, 800);

    return () => {
      observer.disconnect();
      clearTimeout(t);
      video.removeEventListener('canplay', tryPlay);
      video.pause();
      video.removeAttribute('src');
      video.load();                // release network resources
      container.removeChild(video);
    };
  }, [src, poster, alt]);

  return <div ref={containerRef} className="w-full" />;
}

/** Curvy dashed "bee-flight" connector between feature blocks */
const BEE_PATHS = {
  rightToLeft: [
    'M 600,5 C 615,30 580,55 540,58',
    'C 500,61 475,38 435,52',
    'C 395,66 365,88 320,92',
    'C 275,96 250,78 210,95',
  ].join(' '),
  leftToRight: [
    'M 200,5 C 185,30 220,55 260,58',
    'C 300,61 325,38 365,52',
    'C 405,66 435,88 480,92',
    'C 525,96 550,78 590,95',
  ].join(' '),
};

function BeePathConnector({ direction }: { direction: 'rightToLeft' | 'leftToRight' }) {
  return (
    <div className="hidden md:block py-4" aria-hidden>
      <motion.svg
        viewBox="0 0 800 100"
        className="w-full h-24"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <motion.path
          d={BEE_PATHS[direction]}
          stroke="#1e293b"
          strokeWidth="1.5"
          strokeDasharray="20 10"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
      </motion.svg>
    </div>
  );
}

const SHOWCASE_FEATURES = [
  {
    title: 'Course & Assignment Setup',
    description:
      'Create courses, attach rubrics, and upload student videos in just a few clicks. Babblet handles transcription, analysis, and scoring automatically so you can focus on the feedback that matters.',
    image: '/features/feature-courses.png',
    video: '/features/feature-courses.mp4',
    alt: 'Creating a course and setting up an assignment with rubric and video uploads',
  },
  {
    title: 'Targeted Follow-Up Questions',
    description:
      'Babblet automatically generates targeted follow-up questions based on each student\'s transcript. Questions are categorized by cognitive level, from evidence requests to counterarguments, and linked directly to specific moments in the presentation so instructors can probe deeper where it matters most.',
    image: '/features/feature-questions.png',
    video: '/features/feature-questions.mp4',
    alt: 'Follow-up questions interface showing categorized questions with branch functionality',
  },
  {
    title: 'Performance Overview & Insights',
    description:
      'Get a high-level snapshot of every submission at a glance. The overview surfaces an overall performance score, sentiment analysis, speech delivery metrics like word count and pace, and Babblet-identified spotlight moments that capture the key turning points in each student\'s presentation.',
    image: '/features/feature-overview.png',
    video: '/features/feature-overview.mp4',
    alt: 'Submission overview showing performance score, speech metrics, and evidence mapping',
  },
  {
    title: 'Criterion-Level Rubric Grading',
    description:
      'Each submission is evaluated against your exact rubric criteria with per-criterion scores, detailed feedback, and Babblet Insights that explain what worked, what didn\'t, and why. Instructors can review, adjust, and finalize grades with full transparency into how each score was determined.',
    image: '/features/feature-rubric.png',
    video: '/features/feature-rubric.mp4',
    alt: 'Grading rubric interface with per-criterion scoring and Babblet-generated insights',
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute top-64 -right-40 h-[400px] w-[400px] rounded-full bg-blue-200/30 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-surface-100/70 bg-white/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-xl font-semibold text-surface-900">Babblet</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Features</a>
              <Link href="/about" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">About</Link>
              <Link href="/contact" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Contact</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Login</Link>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 lg:py-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-surface-900 leading-[1.1] tracking-tight">
              Grade presentations<br />at <em className="not-italic">scale</em>
            </h1>
            <p className="mt-6 text-xl text-surface-500 max-w-2xl mx-auto">
              Scale grading across courses with lightning fast analytics.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Link
                href="/contact"
                className="px-8 py-3.5 text-base font-medium text-surface-700 bg-white/80 border border-surface-200 hover:border-surface-300 rounded-xl transition-colors shadow-soft"
              >
                Book a Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ====== Feature Showcase ====== */}
      <section id="features" className="py-24 relative">
        {/* Section background accent */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-sky-100/40 blur-3xl" />
        </div>

        <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight">
              See it in action
            </h2>
            <p className="mt-4 text-lg text-surface-500 max-w-2xl mx-auto">
              From targeted follow-up questions to rubric-aligned grading, every feature is designed to save you time and give students better feedback.
            </p>
          </motion.div>

          <div>
            {SHOWCASE_FEATURES.map((feature, idx) => {
              const isReversed = idx % 2 !== 0;
              const isLast = idx === SHOWCASE_FEATURES.length - 1;
              const connectorDir = isReversed ? 'leftToRight' : 'rightToLeft';

              return (
                <Fragment key={feature.title}>
                  <div
                    className={`flex flex-col gap-10 items-center ${
                      isReversed ? 'md:flex-row-reverse' : 'md:flex-row'
                    }`}
                  >
                    {/* Text — animated with translate */}
                    <motion.div
                      className="md:w-3/12 flex-shrink-0"
                      initial={{ opacity: 0, y: 40 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-100px' }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-500 text-white text-sm font-bold shadow-sm">
                          {idx + 1}
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-sky-200 to-transparent" />
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold text-surface-900 leading-snug">
                        {feature.title}
                      </h3>
                      <p className="mt-4 text-base text-surface-500 leading-relaxed">
                        {feature.description}
                      </p>
                    </motion.div>

                    {/* Media — opacity-only animation to keep video pixel-sharp */}
                    <motion.div
                      className="md:w-9/12 flex-shrink-0"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, margin: '-100px' }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    >
                      <div className="rounded-2xl overflow-hidden border border-surface-200 shadow-xl bg-white">
                        {feature.video ? (
                          <FeatureVideo
                            src={feature.video}
                            poster={feature.image}
                            alt={feature.alt}
                          />
                        ) : (
                          <Image
                            src={feature.image}
                            alt={feature.alt}
                            width={1200}
                            height={750}
                            className="w-full h-auto"
                            quality={95}
                            priority={idx === 0}
                          />
                        )}
                      </div>
                    </motion.div>
                  </div>

                  {/* Bee-flight connector to next feature */}
                  {!isLast && <BeePathConnector direction={connectorDir} />}
                </Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-sky-500 to-cyan-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">Reclaim your grading hours</h2>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/contact" className="px-8 py-3.5 text-base font-medium text-white border border-white/30 hover:bg-white/10 rounded-xl transition-colors">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-surface-200 bg-white/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display text-lg font-semibold text-surface-900">Babblet</span>
          </div>
          <p className="text-xs text-surface-500">© 2026 Babblet Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
