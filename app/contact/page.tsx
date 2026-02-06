'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    institution: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setIsSubmitted(true);
      } else {
        setError(data.error || 'Failed to send message. Please try again.');
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="min-h-screen bg-white">
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
              <Link href="/about" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">About</Link>
              <Link href="/contact" className="text-sm text-surface-900 font-medium transition-colors">Contact</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm text-surface-600 hover:text-surface-900 transition-colors">Login</Link>
            </div>
          </nav>
        </div>
      </header>

      <section className="py-16 lg:py-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-12">
            <h1 className="text-4xl font-bold text-surface-900 mb-4">Talk to Sales</h1>
            <p className="text-lg text-surface-600">Interested in Babblet for your institution? Fill out the form below and our team will get in touch.</p>
          </motion.div>

          {isSubmitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-semibold text-emerald-900 mb-2">Thank you!</h2>
              <p className="text-emerald-700 mb-6">
                Your inquiry has been sent successfully. Our team will get back to you shortly.
              </p>
              <Link href="/" className="inline-flex items-center px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors">Back to Home</Link>
            </motion.div>
          ) : (
            <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} onSubmit={handleSubmit} className="bg-surface-50 border border-surface-200 rounded-2xl p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-surface-700 mb-2">First Name *</label>
                    <input type="text" id="firstName" name="firstName" required value={formData.firstName} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" placeholder="John" />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-surface-700 mb-2">Last Name *</label>
                    <input type="text" id="lastName" name="lastName" required value={formData.lastName} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" placeholder="Doe" />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-surface-700 mb-2">Email Address *</label>
                  <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" placeholder="john.doe@university.edu" />
                </div>

                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-surface-700 mb-2">Your Role *</label>
                  <select id="role" name="role" required value={formData.role} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors">
                    <option value="">Select your role</option>
                    <option value="Professor">Professor</option>
                    <option value="Instructor">Instructor</option>
                    <option value="Teaching Assistant">Teaching Assistant</option>
                    <option value="Department Head">Department Head</option>
                    <option value="Administrator">Administrator</option>
                    <option value="IT Staff">IT Staff</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="institution" className="block text-sm font-medium text-surface-700 mb-2">Institution Name *</label>
                  <input type="text" id="institution" name="institution" required value={formData.institution} onChange={handleChange} className="w-full px-4 py-3 bg-white border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors" placeholder="University of Example" />
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? (<><Loader2 className="w-5 h-5 animate-spin" />Sending...</>) : (<><Send className="w-5 h-5" />Submit Inquiry</>)}
                </button>
              </div>
              <p className="mt-6 text-xs text-surface-500 text-center">By submitting this form, you agree to be contacted by our sales team.</p>
            </motion.form>
          )}
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
