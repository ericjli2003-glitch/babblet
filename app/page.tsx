'use client';

import { motion } from 'framer-motion';
import {
  Sparkles,
  Upload,
  Brain,
  FileText,
  Play,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-surface-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-surface-900">Babblet</span>
            </div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                Pricing
              </a>
              <a href="#about" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">
                About
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-4">
              <Link
                href="/courses"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/courses"
                className="text-sm text-surface-600 hover:text-surface-900 transition-colors"
              >
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
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 leading-tight mb-6">
                Grade Student Presentations at Scale with Babblet
              </h1>
              <p className="text-lg text-surface-600 mb-8 leading-relaxed">
                Ensure grading consistency and save hours of manual work. Upload videos in bulk and receive instant, actionable reports for every student based on your custom rubrics.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/courses"
                  className="inline-flex items-center px-6 py-3 text-base font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors shadow-soft hover:shadow-glow"
                >
                  Get Started for Free
                </Link>
                <button
                  className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-surface-700 bg-white border border-surface-300 hover:border-surface-400 rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Watch Demo
                </button>
              </div>
            </motion.div>

            {/* Right Content - App Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-surface-50 rounded-2xl border border-surface-200 shadow-soft-lg p-4 lg:p-6">
                {/* Mock App Interface */}
                <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                  {/* Mock Header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-100">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    <div className="ml-4 flex-1 h-6 bg-surface-100 rounded-md"></div>
                  </div>
                  {/* Mock Content */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <div className="h-4 bg-surface-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-surface-100 rounded w-1/2"></div>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded-full">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span className="text-xs text-emerald-700 font-medium">Complete</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <div className="h-4 bg-surface-200 rounded w-2/3 mb-2"></div>
                        <div className="h-3 bg-surface-100 rounded w-2/5"></div>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded-full">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span className="text-xs text-emerald-700 font-medium">Complete</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <div className="h-4 bg-surface-200 rounded w-4/5 mb-2"></div>
                        <div className="h-3 bg-surface-100 rounded w-1/3"></div>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-full">
                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs text-blue-700 font-medium">Processing</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 border-y border-surface-100 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-medium text-surface-500 tracking-widest uppercase mb-8">
            Trusted by Educators Worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <span className="text-3xl font-bold text-primary-600">500+</span>
              <p className="text-sm text-surface-500">Instructors</p>
            </div>
            <div className="text-center">
              <span className="text-3xl font-bold text-primary-600">50K+</span>
              <p className="text-sm text-surface-500">Videos Graded</p>
            </div>
            <div className="text-center">
              <span className="text-3xl font-bold text-primary-600">98%</span>
              <p className="text-sm text-surface-500">Time Saved</p>
            </div>
            <div className="text-center">
              <span className="text-3xl font-bold text-primary-600">4.9/5</span>
              <p className="text-sm text-surface-500">User Rating</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-4">
              How Babblet Transforms Your Grading
            </h2>
            <p className="text-lg text-surface-600 max-w-2xl mx-auto">
              Three simple steps to move from manual video review to automated, insightful feedback.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Step 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">1. Bulk Upload</h3>
              <p className="text-surface-600 leading-relaxed">
                Securely drag and drop entire class presentation recordings. We support all major formats and LMS integrations.
              </p>
            </motion.div>

            {/* Step 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
                <Brain className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">2. Babblet Analysis</h3>
              <p className="text-surface-600 leading-relaxed">
                Babblet evaluates speech patterns, tone, slide content, and key arguments against your specific grading rubric.
              </p>
            </motion.div>

            {/* Step 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
                <FileText className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-3">3. Instant Reports</h3>
              <p className="text-surface-600 leading-relaxed">
                Generate detailed feedback cards and summary reports. Send directly to your gradebook with a single click.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to reclaim your grading hours?
            </h2>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              Join over 500+ instructors who are using Babblet to provide more objective and faster feedback to their students.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/courses"
                className="inline-flex items-center px-6 py-3 text-base font-medium text-primary-600 bg-white hover:bg-surface-50 rounded-lg transition-colors shadow-soft"
              >
                Create Free Account
              </Link>
              <a
                href="mailto:eric@babblet.io"
                className="inline-flex items-center px-6 py-3 text-base font-medium text-white border border-white/30 hover:bg-white/10 rounded-lg transition-colors"
              >
                Talk to Sales
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-surface-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            {/* Logo & Description */}
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

          {/* Bottom Bar */}
          <div className="mt-12 pt-8 border-t border-surface-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-surface-500">
              © 2024 Babblet Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              {/* Social Icons */}
              <a href="#" className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
