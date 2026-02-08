'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const SHOWCASE_FEATURES = [
  {
    title: 'Course Management',
    description:
      'Organize your classes in one place. Create courses, import from your LMS, or set them up manually in seconds. Each course holds its own assignments, rubrics, and materials, giving you a clean workspace for every section you teach.',
    image: '/features/feature-courses.png',
    alt: 'Course dashboard showing the Your Courses view with option to add a new course',
  },
  {
    title: 'Assignment Setup & Grading',
    description:
      'Create assignments within any course, attach your rubric, and start grading immediately. Upload an entire batch of student videos at once and Babblet handles transcription, analysis, and scoring automatically so you can focus on the feedback that matters.',
    image: '/features/feature-assignments.png',
    alt: 'Assignment view within a course showing the Create Assignment option',
  },
  {
    title: 'Targeted Follow-Up Questions',
    description:
      'Babblet automatically generates targeted follow-up questions based on each student\'s transcript. Questions are categorized by cognitive level, from evidence requests to counterarguments, and linked directly to specific moments in the presentation so instructors can probe deeper where it matters most.',
    image: '/features/feature-questions.png',
    alt: 'Follow-up questions interface showing categorized questions with branch functionality',
  },
  {
    title: 'Performance Overview & Insights',
    description:
      'Get a high-level snapshot of every submission at a glance. The overview surfaces an overall performance score, sentiment analysis, speech delivery metrics like word count and pace, and Babblet-identified spotlight moments that capture the key turning points in each student\'s presentation.',
    image: '/features/feature-overview.png',
    alt: 'Submission overview showing performance score, speech metrics, and evidence mapping',
  },
  {
    title: 'Criterion-Level Rubric Grading',
    description:
      'Each submission is evaluated against your exact rubric criteria with per-criterion scores, detailed feedback, and Babblet Insights that explain what worked, what didn\'t, and why. Instructors can review, adjust, and finalize grades with full transparency into how each score was determined.',
    image: '/features/feature-rubric.png',
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
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
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
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-surface-900 leading-[1.1] tracking-tight">
              Grade presentations<br />at scale
            </h1>
            <p className="mt-6 text-xl text-surface-500 max-w-2xl mx-auto">
              Scale grading across courses with lightning fast analytics.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Link
                href="/contact"
                className="px-8 py-3.5 text-base font-medium text-surface-700 bg-white/80 border border-surface-200 hover:border-surface-300 rounded-xl transition-colors shadow-soft"
              >
                Talk to Sales
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight">
              See it in action
            </h2>
            <p className="mt-4 text-lg text-surface-500 max-w-2xl mx-auto">
              From targeted follow-up questions to rubric-aligned grading, every feature is designed to save you time and give students better feedback.
            </p>
          </motion.div>

          <div className="space-y-32">
            {SHOWCASE_FEATURES.map((feature, idx) => {
              const isReversed = idx % 2 !== 0;

              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className={`flex flex-col gap-12 items-center ${
                    isReversed ? 'lg:flex-row-reverse' : 'lg:flex-row'
                  }`}
                >
                  {/* Text */}
                  <div className="lg:w-5/12 flex-shrink-0">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-500 text-white text-sm font-bold shadow-sm">
                        {idx + 1}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-sky-200 to-transparent" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-surface-900 leading-snug">
                      {feature.title}
                    </h3>
                    <p className="mt-4 text-base text-surface-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Image */}
                  <div className="lg:w-7/12 flex-shrink-0">
                    <div className="relative rounded-2xl overflow-hidden border border-surface-200 shadow-xl bg-white">
                      <div className="absolute inset-0 bg-gradient-to-tr from-sky-50/50 via-transparent to-blue-50/30 pointer-events-none z-10 rounded-2xl" />
                      <Image
                        src={feature.image}
                        alt={feature.alt}
                        width={1200}
                        height={750}
                        className="w-full h-auto"
                        quality={95}
                        priority={idx === 0}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-sky-500 to-cyan-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Reclaim your grading hours</h2>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/contact" className="px-8 py-3.5 text-base font-medium text-white border border-white/30 hover:bg-white/10 rounded-xl transition-colors">
              Talk to Sales
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
            <span className="text-lg font-semibold text-surface-900">Babblet</span>
          </div>
          <p className="text-xs text-surface-500">© 2026 Babblet Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
