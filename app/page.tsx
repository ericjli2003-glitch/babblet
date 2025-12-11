'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Mic, 
  Brain, 
  MessageCircleQuestion,
  Zap,
  ArrowRight,
  Volume2,
  FileText,
  Lightbulb,
  Sparkles
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-surface-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold gradient-text">Babblet</span>
          </div>
          
          <Link 
            href="/live"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-subtle border border-primary-200 text-primary-600 rounded-xl hover:shadow-soft transition-all"
          >
            <Mic className="w-4 h-4" />
            Open Dashboard
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold text-surface-900 mb-6 leading-tight">
              Real-Time{' '}
              <span className="gradient-text">AI Questions</span>
              <br />
              For Student Presentations
            </h1>
            
            <p className="text-xl text-surface-500 max-w-2xl mx-auto mb-10">
              Listen to student presentations in real-time. Babblet uses Gemini for audio understanding 
              and GPT-4 to generate insightful questions—from clarifying queries to critical thinking challenges.
            </p>
            
            <Link href="/live">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary text-lg gap-3"
              >
                <Mic className="w-6 h-6" />
                Start Listening
                <ArrowRight className="w-5 h-5" />
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
          />
          <FeatureCard
            icon={Brain}
            title="Semantic Detection"
            description="Gemini identifies claims, definitions, examples, and topic shifts as they happen."
          />
          <FeatureCard
            icon={MessageCircleQuestion}
            title="Smart Questions"
            description="GPT-4 generates contextual questions: follow-ups, clarifying, critical thinking."
          />
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="card-neumorphic p-8"
        >
          <h2 className="text-3xl font-bold text-surface-900 mb-8 text-center">How It Works</h2>
          
          <div className="grid md:grid-cols-4 gap-6">
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
            color="primary"
          />
          <QuestionTypeCard
            type="Clarifying"
            example="What do you mean by...?"
            color="amber"
          />
          <QuestionTypeCard
            type="Critical Thinking"
            example="What would happen if...?"
            color="accent"
          />
          <QuestionTypeCard
            type="Misconception"
            example="Are you sure that...?"
            color="rose"
          />
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-200 py-6 text-center">
        <p className="text-surface-400 text-sm">
          Powered by <span className="gradient-text font-medium">Babblet AI</span>
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
}: { 
  icon: React.ElementType;
  title: string; 
  description: string; 
}) {
  return (
    <div className="card-neumorphic p-6 group">
      <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4 shadow-soft group-hover:shadow-glow transition-all">
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-surface-900 mb-2">{title}</h3>
      <p className="text-surface-500">{description}</p>
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
        <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center shadow-soft">
          <Icon className="w-7 h-7 text-white" />
        </div>
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold text-primary-500 border-2 border-primary-500 shadow-soft">
          {step}
        </span>
      </div>
      <h4 className="font-semibold text-surface-900 mb-1">{title}</h4>
      <p className="text-sm text-surface-500">{description}</p>
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
  color: 'primary' | 'amber' | 'accent' | 'rose';
}) {
  const colorClasses = {
    primary: 'bg-primary-50 border-primary-200 text-primary-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    accent: 'bg-accent-50 border-accent-200 text-accent-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
  };
  
  return (
    <div className={`rounded-2xl border p-4 ${colorClasses[color]}`}>
      <h4 className="font-semibold mb-2">{type}</h4>
      <p className="text-sm opacity-80 italic">&ldquo;{example}&rdquo;</p>
    </div>
  );
}
