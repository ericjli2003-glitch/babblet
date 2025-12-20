'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Upload,
  FileVideo,
  Presentation,
  Sparkles,
  ArrowRight,
  Brain,
  MessageCircleQuestion,
  ClipboardCheck,
  Zap,
  CheckCircle2,
  Loader2,
  FolderOpen,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import SlideUpload from '@/components/SlideUpload';

type InputMode = 'upload' | 'live' | null;

export default function HomePage() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<InputMode>(null);
  const [slidesFile, setSlidesFile] = useState<File | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [presenterName, setPresenterName] = useState('');
  const [presentationTitle, setPresentationTitle] = useState('');

  const handleStartSession = async () => {
    setIsStarting(true);

    try {
      // Create session via API
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedMode,
          title: presentationTitle || 'Untitled Presentation',
          presenterName: presenterName || undefined,
        }),
      });

      const data = await response.json();
      
      if (data.sessionId) {
        // Navigate to live dashboard
        router.push(`/live?sessionId=${data.sessionId}&mode=${selectedMode}`);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      setIsStarting(false);
    }
  };

  const features = [
    {
      icon: Brain,
      title: 'Real-Time Analysis',
      description: 'AI analyzes content as it happens, identifying key claims and logical gaps',
    },
    {
      icon: MessageCircleQuestion,
      title: 'Smart Questions',
      description: 'Automatically generates clarifying, critical thinking, and expansion questions',
    },
    {
      icon: ClipboardCheck,
      title: 'Rubric Evaluation',
      description: 'Comprehensive scoring on content quality, delivery, and evidence strength',
    },
    {
      icon: Zap,
      title: 'Instant Feedback',
      description: 'Get actionable insights immediately after the presentation ends',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold gradient-text">Babblet</span>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl sm:text-6xl font-bold text-surface-900 mb-6 tracking-tight">
            AI-Powered{' '}
            <span className="gradient-text">Presentation Analysis</span>
          </h1>
          <p className="text-xl text-surface-600 max-w-2xl mx-auto leading-relaxed">
            Transform how you evaluate student presentations. Get real-time insights,
            intelligent questions, and comprehensive rubric evaluations.
          </p>
        </motion.div>

        {/* Mode Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <h2 className="text-lg font-medium text-surface-700 text-center mb-6">
            Choose how to capture the presentation
          </h2>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Upload Option */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedMode('upload')}
              className={`relative p-8 rounded-3xl text-left transition-all duration-300 ${
                selectedMode === 'upload'
                  ? 'bg-white shadow-soft-lg ring-2 ring-primary-500'
                  : 'bg-white/60 shadow-soft hover:bg-white hover:shadow-soft-lg'
              }`}
            >
              {selectedMode === 'upload' && (
                <div className="absolute top-4 right-4">
                  <CheckCircle2 className="w-6 h-6 text-primary-500" />
                </div>
              )}
              <div className="w-14 h-14 rounded-2xl bg-gradient-subtle flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-2">Upload Video</h3>
              <p className="text-surface-600 text-sm">
                Upload a pre-recorded presentation video (MP4, MOV, WebM)
              </p>
            </motion.button>

            {/* Live Recording Option */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedMode('live')}
              className={`relative p-8 rounded-3xl text-left transition-all duration-300 ${
                selectedMode === 'live'
                  ? 'bg-white shadow-soft-lg ring-2 ring-primary-500'
                  : 'bg-white/60 shadow-soft hover:bg-white hover:shadow-soft-lg'
              }`}
            >
              {selectedMode === 'live' && (
                <div className="absolute top-4 right-4">
                  <CheckCircle2 className="w-6 h-6 text-primary-500" />
                </div>
              )}
              <div className="w-14 h-14 rounded-2xl bg-gradient-subtle flex items-center justify-center mb-4">
                <Mic className="w-7 h-7 text-accent-600" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-2">Record Live</h3>
              <p className="text-surface-600 text-sm">
                Capture audio in real-time using your microphone
              </p>
            </motion.button>

            {/* Bulk Upload Option - Direct link */}
            <Link
              href="/bulk"
              className="relative p-8 rounded-3xl text-left transition-all duration-300 bg-white/60 shadow-soft hover:bg-white hover:shadow-soft-lg hover:ring-2 hover:ring-emerald-500 group"
            >
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                  <Users className="w-3 h-3" />
                  <span>Batch</span>
                </div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4 group-hover:bg-emerald-500 transition-colors">
                <FolderOpen className="w-7 h-7 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl font-semibold text-surface-900 mb-2">Bulk Upload</h3>
              <p className="text-surface-600 text-sm">
                Grade multiple student videos at once with batch processing
              </p>
            </Link>
          </div>

          {/* Configuration Form */}
          <AnimatePresence mode="wait">
            {selectedMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-3xl shadow-soft p-8 space-y-6">
                  {/* Basic Info */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-2">
                        Presentation Title (optional)
                      </label>
                      <input
                        type="text"
                        value={presentationTitle}
                        onChange={(e) => setPresentationTitle(e.target.value)}
                        placeholder="e.g., Climate Change Research"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-2">
                        Presenter Name (optional)
                      </label>
                      <input
                        type="text"
                        value={presenterName}
                        onChange={(e) => setPresenterName(e.target.value)}
                        placeholder="e.g., John Smith"
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* Video Upload info (only for upload mode) */}
                  {selectedMode === 'upload' && (
                    <div className="p-6 rounded-2xl bg-gradient-subtle border border-primary-200">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-soft flex items-center justify-center flex-shrink-0">
                          <FileVideo className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-surface-900 mb-1">Video Selection</h4>
                          <p className="text-sm text-surface-600">
                            You&apos;ll select your video file on the next screen. The AI will extract audio 
                            and transcribe as the video plays, with full playback controls.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="px-2 py-1 bg-white rounded-lg text-xs text-surface-600">MP4</span>
                            <span className="px-2 py-1 bg-white rounded-lg text-xs text-surface-600">MOV</span>
                            <span className="px-2 py-1 bg-white rounded-lg text-xs text-surface-600">WebM</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slides Upload (optional for both modes) */}
                  <SlideUpload
                    onFileSelect={(file) => setSlidesFile(file)}
                    selectedFile={slidesFile}
                  />

                  {/* Start Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartSession}
                    disabled={isStarting}
                    className="w-full btn-primary py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Starting Session...
                      </>
                    ) : (
                      <>
                        {selectedMode === 'upload' ? 'Continue to Upload' : 'Start Recording'}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-24"
        >
          <h2 className="text-2xl font-semibold text-surface-900 text-center mb-12">
            Everything you need to evaluate presentations
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                className="card-neumorphic p-6 hover:shadow-soft-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-subtle flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-surface-900 mb-2">{feature.title}</h3>
                <p className="text-surface-600 text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-24 mb-16"
        >
          <h2 className="text-2xl font-semibold text-surface-900 text-center mb-12">
            How it works
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-4">
            {[
              { step: 1, icon: Upload, label: 'Upload or Record' },
              { step: 2, icon: Brain, label: 'AI Analyzes' },
              { step: 3, icon: MessageCircleQuestion, label: 'Questions Generated' },
              { step: 4, icon: ClipboardCheck, label: 'Get Evaluation' },
            ].map((item, index) => (
              <div key={item.step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow mb-3">
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-xs text-surface-500 font-medium">STEP {item.step}</span>
                  <span className="text-sm font-medium text-surface-900">{item.label}</span>
                </div>
                {index < 3 && (
                  <ArrowRight className="hidden md:block w-8 h-8 text-surface-300 mx-4" />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-500" />
              <span className="text-sm text-surface-600">Babblet</span>
            </div>
            <p className="text-sm text-surface-500">
              Powered by Babblet AI
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

