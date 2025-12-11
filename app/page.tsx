'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Mic, 
  Sparkles, 
  Brain, 
  MessageCircleQuestion,
  Zap,
  ArrowRight,
  Volume2,
  FileText,
  Lightbulb
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-slate-900/30 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Sparkles className="w-8 h-8 text-purple-400" />
              <Sparkles className="w-5 h-5 text-blue-400 absolute -right-1 bottom-0" />
            </div>
            <span className="font-bold text-2xl bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Babblet
            </span>
          </div>
          
          <Link 
            href="/live"
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            <Mic className="w-4 h-4" />
            Open Dashboard
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Real-Time{' '}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                AI Questions
              </span>
              <br />
              For Student Presentations
            </h1>
            
            <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10">
              Listen to student presentations in real-time. Babblet uses Gemini for audio understanding 
              and GPT-4 to generate insightful questions—from clarifying queries to critical thinking challenges.
            </p>
            
            <Link href="/live">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-lg rounded-xl hover:shadow-2xl hover:shadow-purple-500/30 transition-all"
              >
                <Mic className="w-6 h-6" />
                Start Listening
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </Link>
          </motion.div>
        </div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid md:grid-cols-3 gap-6 mb-20"
        >
          <FeatureCard
            icon={Volume2}
            title="Real-Time Audio"
            description="Streams audio in 500ms chunks for instant transcription and analysis."
            gradient="from-purple-500 to-pink-500"
          />
          <FeatureCard
            icon={Brain}
            title="Semantic Detection"
            description="Gemini identifies claims, definitions, examples, and topic shifts as they happen."
            gradient="from-pink-500 to-orange-500"
          />
          <FeatureCard
            icon={MessageCircleQuestion}
            title="Smart Questions"
            description="GPT-4 generates contextual questions: follow-ups, clarifying, critical thinking."
            gradient="from-blue-500 to-cyan-500"
          />
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-slate-900/50 backdrop-blur-sm rounded-3xl border border-white/10 p-8"
        >
          <h2 className="text-3xl font-bold text-white mb-8 text-center">How It Works</h2>
          
          <div className="grid md:grid-cols-4 gap-4">
            <WorkflowStep
              step={1}
              icon={Mic}
              title="Record"
              description="Click to start listening to a live presentation"
            />
            <WorkflowStep
              step={2}
              icon={FileText}
              title="Transcribe"
              description="Gemini transcribes and detects semantic events"
            />
            <WorkflowStep
              step={3}
              icon={Lightbulb}
              title="Analyze"
              description="GPT-4 generates insightful questions in real-time"
            />
            <WorkflowStep
              step={4}
              icon={Zap}
              title="Engage"
              description="Use questions to deepen student understanding"
            />
          </div>
        </motion.div>

        {/* Question types preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <QuestionTypeCard
            type="Follow-up"
            example="Can you elaborate on how this relates to...?"
            color="blue"
          />
          <QuestionTypeCard
            type="Clarifying"
            example="What do you mean by...?"
            color="amber"
          />
          <QuestionTypeCard
            type="Critical Thinking"
            example="What would happen if...?"
            color="purple"
          />
          <QuestionTypeCard
            type="Misconception"
            example="Are you sure that...?"
            color="red"
          />
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center">
        <p className="text-white/40 text-sm">
          Powered by <span className="text-purple-400">Babblet AI</span> · Built with Gemini & GPT-4
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  gradient 
}: { 
  icon: React.ElementType;
  title: string; 
  description: string; 
  gradient: string;
}) {
  return (
    <div className="group relative bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-white/60">{description}</p>
    </div>
  );
}

function WorkflowStep({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="relative inline-block mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <Icon className="w-7 h-7 text-white" />
        </div>
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-purple-400 border-2 border-purple-500">
          {step}
        </span>
      </div>
      <h4 className="font-semibold text-white mb-1">{title}</h4>
      <p className="text-sm text-white/50">{description}</p>
    </div>
  );
}

function QuestionTypeCard({
  type,
  example,
  color,
}: {
  type: string;
  example: string;
  color: 'blue' | 'amber' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
  };
  
  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
      <h4 className="font-semibold text-white mb-2">{type}</h4>
      <p className="text-sm text-white/60 italic">&ldquo;{example}&rdquo;</p>
    </div>
  );
}
