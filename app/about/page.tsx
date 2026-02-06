'use client';

import { motion } from 'framer-motion';
import { Sparkles, Target, Users, Zap } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-surface-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/#features" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Features</Link>
              <Link href="/about" className="text-sm text-surface-900 font-medium transition-colors">About</Link>
              <Link href="/contact" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Contact</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Login</Link>
            </div>
          </nav>
        </div>
      </header>

      <section className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl font-bold text-surface-900 leading-tight mb-6">About Babblet</h1>
            <p className="text-lg text-surface-600 leading-relaxed max-w-2xl mx-auto">
              We are on a mission to transform how educators evaluate student presentations, making grading faster, fairer, and more insightful.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-white rounded-2xl p-8 border border-surface-200">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-6"><Target className="w-6 h-6 text-primary-600" /></div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">Our Mission</h3>
              <p className="text-surface-600 leading-relaxed">To empower educators with AI-powered tools that provide consistent, objective feedback while saving countless hours of manual grading work.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }} className="bg-white rounded-2xl p-8 border border-surface-200">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-6"><Users className="w-6 h-6 text-primary-600" /></div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">Who We Serve</h3>
              <p className="text-surface-600 leading-relaxed">Universities, colleges, and educational institutions looking to scale their presentation-based assessments without compromising on quality.</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }} className="bg-white rounded-2xl p-8 border border-surface-200">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-6"><Zap className="w-6 h-6 text-primary-600" /></div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">Our Approach</h3>
              <p className="text-surface-600 leading-relaxed">We combine cutting-edge AI with educator expertise to analyze speech patterns, content quality, and presentation skills against your custom rubrics.</p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 className="text-3xl font-bold text-surface-900 mb-6 text-center">Our Story</h2>
            <div className="prose prose-lg text-surface-600 max-w-none">
              <p className="leading-relaxed mb-6">Babblet was born from a simple observation: educators spend countless hours watching and re-watching student presentation videos, often struggling to maintain consistent grading standards across dozens or hundreds of submissions.</p>
              <p className="leading-relaxed mb-6">We built Babblet to solve this problem. Our platform uses advanced AI to analyze presentations holistically - evaluating not just what students say, but how they say it, how they structure their arguments, and how well they meet specific rubric criteria.</p>
              <p className="leading-relaxed">Today, Babblet helps educators reclaim their time while providing students with more detailed, actionable feedback than ever before.</p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-gradient-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 className="text-3xl font-bold text-white mb-4">Ready to transform your grading?</h2>
            <p className="text-lg text-white/80 mb-8">Get in touch with our team to learn how Babblet can help your institution.</p>
            <Link href="/contact" className="inline-flex items-center px-6 py-3 text-base font-medium text-primary-600 bg-white hover:bg-surface-50 rounded-lg transition-colors shadow-soft">Talk to Sales</Link>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 border-t border-surface-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
            </Link>
            <p className="text-sm text-surface-600 leading-relaxed max-w-md">Modern grading solutions for modern educators. Enabling faster, more consistent feedback.</p>
          </div>
          <div className="mt-12 pt-8 border-t border-surface-200 flex items-center justify-center">
            <p className="text-sm text-surface-500">© 2026 Babblet Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
