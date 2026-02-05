'use client';

import { motion } from 'framer-motion';
import {
  Sparkles,
  Upload,
  Brain,
  FileText,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';

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
                Generate detailed feedback cards and summary reports.
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
      <footer className="py-12 border-t border-surface-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
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
          <div className="mt-12 pt-8 border-t border-surface-200 flex items-center justify-center">
            <p className="text-sm text-surface-500">
              © 2026 Babblet Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
