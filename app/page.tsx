'use client';

import { motion } from 'framer-motion';
import {
  BarChart3,
  Brain,
  CheckCircle,
  ClipboardCheck,
  FileText,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Decorative gradients */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[460px] w-[460px] rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute top-64 -right-40 h-[460px] w-[460px] rounded-full bg-blue-200/30 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-surface-100/70 bg-white/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
            </Link>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                Features
              </a>
              <Link href="/about" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                About
              </Link>
              <Link href="/contact" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                Contact
              </Link>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-4">
              <Link
                href="/courses"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-soft"
              >
                Sign Up
              </Link>
              <Link href="/courses" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                Login
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-surface-200 bg-white/70 text-xs text-surface-700 shadow-soft">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700">
                  <Sparkles className="w-3 h-3" />
                </span>
                AI-assisted presentation grading, built for rubrics
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 leading-tight mb-6 mt-4">
                Grade student presentations at scale — consistently
              </h1>

              <p className="text-lg text-surface-600 mb-8 leading-relaxed">
                Upload videos in bulk, evaluate against your rubric, and get clear, actionable feedback — plus speech delivery metrics, verification, and re-grading when you need it.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/courses"
                  className="inline-flex items-center px-6 py-3 text-base font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-soft hover:shadow-glow"
                >
                  Get Started
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center px-6 py-3 text-base font-medium text-surface-700 bg-white/80 border border-surface-200 hover:border-surface-300 rounded-lg transition-colors shadow-soft"
                >
                  Talk to Sales
                </Link>
              </div>

              <div className="mt-8 grid sm:grid-cols-2 gap-3 text-sm text-surface-700">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>
                    <span className="font-semibold text-surface-900">Rubric-aligned</span> scoring and rationale you can defend.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>
                    <span className="font-semibold text-surface-900">Re-grade anytime</span> with versioning (e.g., “2nd grading”).
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>
                    <span className="font-semibold text-surface-900">Speech metrics</span> (pace, filler words, pauses) per student.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>
                    <span className="font-semibold text-surface-900">Assistant</span> that answers questions on highlighted evidence.
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Right Content - App Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-white/70 rounded-2xl border border-surface-200 shadow-soft-lg p-4 lg:p-6 backdrop-blur">
                <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                        <ClipboardCheck className="w-4 h-4 text-primary-700" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-surface-900">Assignment Dashboard</div>
                        <div className="text-xs text-surface-500">Batch grading, status, and re-grades</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-surface-500 bg-surface-50 border border-surface-200 rounded-full px-2 py-1">
                      12 submissions
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-sky-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-surface-900 truncate">Lindsay</div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
                            2nd grading
                          </span>
                        </div>
                        <div className="text-xs text-surface-500 truncate">Rubric: SOAP Documentation</div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded-full">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span className="text-xs text-emerald-700 font-medium">Ready</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-cyan-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-surface-900 truncate">Speech Delivery</div>
                        <div className="text-xs text-surface-500 truncate">Pace • filler words • pauses</div>
                      </div>
                      <span className="text-xs font-medium text-surface-700 bg-surface-50 border border-surface-200 rounded-full px-2 py-1">
                        Avg shown
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <MessageSquareText className="w-5 h-5 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-surface-900 truncate">Contextual Assistant</div>
                        <div className="text-xs text-surface-500 truncate">Ask about highlighted evidence</div>
                      </div>
                      <span className="text-xs font-medium text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-1">
                        Evidence tags
                      </span>
                    </div>

                    <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-surface-700">Verification</div>
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="mt-2 text-xs text-surface-500">
                        Integrity signals and transcript accuracy surfaced alongside grading.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-4">Everything you need for fast, fair grading</h2>
            <p className="text-lg text-surface-600 max-w-3xl mx-auto">
              Babblet is built around the real workflows we’ve shipped: bulk processing, rubric scoring, re-grading, and evidence-aware feedback — all in one place.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Upload className="w-5 h-5 text-primary-700" />,
                title: 'Bulk upload + batch grading',
                desc: 'Drag and drop a whole class. Track processing status per student and keep everything organized by assignment.',
              },
              {
                icon: <ClipboardCheck className="w-5 h-5 text-primary-700" />,
                title: 'Rubric-aligned evaluation',
                desc: 'Score against your rubric criteria with clear rationale and consistent breakdowns across every submission.',
              },
              {
                icon: <FileText className="w-5 h-5 text-primary-700" />,
                title: 'Instant, actionable reports',
                desc: 'Strengths, improvements, questions, and summaries — formatted for fast review and easy student feedback.',
              },
              {
                icon: <BarChart3 className="w-5 h-5 text-primary-700" />,
                title: 'Speech delivery metrics',
                desc: 'Pace, filler words, pauses, and more — including assignment-level averages for quick benchmarking.',
              },
              {
                icon: <ShieldCheck className="w-5 h-5 text-primary-700" />,
                title: 'Verification + integrity signals',
                desc: 'Surface credibility checks and evidence to support grading decisions and student discussions.',
              },
              {
                icon: <RefreshCw className="w-5 h-5 text-primary-700" />,
                title: 'Re-grade with version history',
                desc: 'Re-grade selected submissions and see “2nd grading”, “3rd grading”, etc., without losing the original flow.',
              },
              {
                icon: <MessageSquareText className="w-5 h-5 text-primary-700" />,
                title: 'Contextual assistant',
                desc: 'Highlight any evidence (transcript, rubric, questions) and ask for clarification, critique, or improvements.',
              },
              {
                icon: <Brain className="w-5 h-5 text-primary-700" />,
                title: 'Course material alignment',
                desc: 'Evaluate depth, terminology, and topic coverage against your teaching goals and learning objectives.',
              },
              {
                icon: <Sparkles className="w-5 h-5 text-primary-700" />,
                title: 'Polished grading experience',
                desc: 'Purpose-built UI for instructors: clear states, fast navigation, and sensible defaults for real classrooms.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-surface-200 bg-white/70 backdrop-blur p-6 shadow-soft hover:shadow-soft-lg transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold text-surface-900 mb-2">{f.title}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <h2 className="text-3xl font-bold text-surface-900 mb-3">A workflow that matches how you grade</h2>
              <p className="text-surface-600 leading-relaxed">
                Babblet keeps the whole lifecycle together — upload, analyze, review, and re-grade — while preserving evidence and versions.
              </p>
            </div>
            <div className="lg:col-span-2 grid sm:grid-cols-3 gap-4">
              {[
                { step: '01', title: 'Upload', desc: 'Bulk upload a batch for an assignment and track progress.', icon: <Upload className="w-5 h-5 text-sky-700" /> },
                { step: '02', title: 'Analyze', desc: 'Rubric scoring, questions, and delivery metrics are generated.', icon: <Brain className="w-5 h-5 text-sky-700" /> },
                { step: '03', title: 'Review + Re-grade', desc: 'Give feedback fast and re-grade selected submissions with history.', icon: <RefreshCw className="w-5 h-5 text-sky-700" /> },
              ].map((s) => (
                <div key={s.step} className="rounded-2xl border border-surface-200 bg-white/70 backdrop-blur p-5 shadow-soft">
                  <div className="flex items-center justify-between mb-4">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                        {s.icon}
                      </div>
                      <div className="text-sm font-semibold text-surface-900">{s.title}</div>
                    </div>
                    <div className="text-xs font-semibold text-surface-400">{s.step}</div>
                  </div>
                  <p className="text-sm text-surface-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-sky-500 to-cyan-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to reclaim your grading hours?</h2>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              See how Babblet fits your course, rubric, and grading workflow.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/courses"
                className="inline-flex items-center px-6 py-3 text-base font-medium text-sky-700 bg-white hover:bg-surface-50 rounded-lg transition-colors shadow-soft"
              >
                Get Started
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center px-6 py-3 text-base font-medium text-white border border-white/30 hover:bg-white/10 rounded-lg transition-colors"
              >
                Talk to Sales
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-surface-200 bg-white/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
            </div>
            <p className="text-sm text-surface-600 leading-relaxed max-w-md">
              Modern grading solutions for modern educators. Enabling faster, more consistent feedback.
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-surface-200 flex items-center justify-center">
            <p className="text-sm text-surface-500">© 2026 Babblet Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
