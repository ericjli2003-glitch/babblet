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

const FEATURES = [
  { icon: Upload, label: 'Bulk Upload', sub: 'Drag & drop an entire class at once.' },
  { icon: ClipboardCheck, label: 'Rubric Scoring', sub: 'Scored against your criteria automatically.' },
  { icon: FileText, label: 'Instant Reports', sub: 'Strengths, improvements, and summaries.' },
  { icon: BarChart3, label: 'Speech Metrics', sub: 'Pace, filler words, and pause analysis.' },
  { icon: ShieldCheck, label: 'Verification', sub: 'Integrity and accuracy signals built in.' },
  { icon: RefreshCw, label: 'Re-grading', sub: 'Re-grade with full version history.' },
  { icon: MessageSquareText, label: 'AI Assistant', sub: 'Ask questions about any highlighted text.' },
  { icon: Brain, label: 'Content Alignment', sub: 'Match depth and terminology to your goals.' },
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
              <Link href="/courses" className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-soft">Sign Up</Link>
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
              Upload. Evaluate. Feedback. Done.
            </p>
            <div className="mt-10 flex justify-center gap-4">
              <Link
                href="/courses"
                className="px-8 py-3.5 text-base font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-colors shadow-soft hover:shadow-glow"
              >
                Get Started
              </Link>
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

      {/* Feature Icons Row */}
      <section id="features" className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex flex-col items-center gap-3 rounded-2xl border border-surface-200 bg-white/70 backdrop-blur p-6 shadow-soft hover:shadow-soft-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                  <f.icon className="w-6 h-6 text-primary-700" />
                </div>
                <span className="text-sm font-semibold text-surface-900 text-center">{f.label}</span>
                <span className="text-xs text-surface-500 text-center leading-snug">{f.sub}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - 3 steps */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-surface-900 text-center mb-10">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { n: '1', icon: Upload, title: 'Upload', sub: 'Drag & drop a batch of videos.' },
              { n: '2', icon: Brain, title: 'Analyze', sub: 'Rubric scoring + speech metrics.' },
              { n: '3', icon: RefreshCw, title: 'Review', sub: 'Feedback, re-grade, repeat.' },
            ].map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-surface-200 bg-white/70 backdrop-blur p-6 shadow-soft text-center">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center shadow-soft">
                  {s.n}
                </div>
                <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center mx-auto mt-2 mb-3">
                  <s.icon className="w-6 h-6 text-sky-700" />
                </div>
                <div className="text-base font-semibold text-surface-900">{s.title}</div>
                <div className="mt-1 text-sm text-surface-500">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-sky-500 to-cyan-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Reclaim your grading hours</h2>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/courses" className="px-8 py-3.5 text-base font-medium text-sky-700 bg-white hover:bg-surface-50 rounded-xl transition-colors shadow-soft">
              Get Started
            </Link>
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
