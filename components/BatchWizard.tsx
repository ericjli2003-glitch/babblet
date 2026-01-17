'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowRight, Check, Upload,
  FileText, Trash2, Cloud, Loader2, CheckCircle, AlertCircle, HelpCircle,
  Edit2
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface Course {
  id: string;
  name: string;
}

interface RubricLevel {
  score: number;
  label: string;
  description: string;
}

interface RubricCriterion {
  name: string;
  description: string;
  points: number;
  levels?: RubricLevel[];
}

interface Rubric {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  totalPoints: number;
}

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'waiting' | 'uploading' | 'complete' | 'error';
  error?: string;
}

interface BatchWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (batchId: string) => void;
  courses: Course[];
  defaultCourseId?: string;
}

// ============================================
// Mock Data
// ============================================

const defaultLevels: RubricLevel[] = [
  { score: 1, label: 'Poor', description: 'Argument is incoherent or missing critical components.' },
  { score: 2, label: 'Fair', description: 'Argument is present but lacks sufficient evidence or structure.' },
  { score: 3, label: 'Good', description: 'Argument is clear and well-supported with relevant examples.' },
  { score: 4, label: 'Excellent', description: 'Argument is compelling, highly organized, and uses sophisticated reasoning.' },
];

const defaultRubrics: Rubric[] = [
  {
    id: 'standard-presentation',
    name: 'Standard Presentation Rubric (University Level)',
    totalPoints: 100,
    criteria: [
      { name: 'Content Quality', description: 'Depth of research and accuracy of information presented.', points: 40, levels: defaultLevels },
      { name: 'Visual Aids', description: 'Effectiveness of slides, charts, and media supporting the talk.', points: 20, levels: defaultLevels },
      { name: 'Delivery', description: 'Pacing, clarity of voice, and engagement with the audience.', points: 25, levels: defaultLevels },
      { name: 'Q&A Handling', description: 'Ability to answer follow-up questions accurately.', points: 15, levels: defaultLevels },
    ],
  },
  {
    id: 'basic-speech',
    name: 'Basic Speech Rubric',
    totalPoints: 50,
    criteria: [
      { name: 'Content', description: 'Quality and relevance of content.', points: 20, levels: defaultLevels },
      { name: 'Delivery', description: 'Speaking skills and clarity.', points: 20, levels: defaultLevels },
      { name: 'Time Management', description: 'Appropriate length and pacing.', points: 10, levels: defaultLevels },
    ],
  },
];

// ============================================
// Helper Functions
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================
// Step Components
// ============================================

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-8 py-6">
      {steps.map((step, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={step} className="flex flex-col items-center gap-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                isCompleted
                  ? 'bg-primary-500 text-white'
                  : isActive
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-100 text-surface-400'
              }`}
            >
              {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
            </div>
            <div className="text-center">
              <p className={`text-sm font-medium ${isActive || isCompleted ? 'text-primary-600' : 'text-surface-400'}`}>
                {step}
              </p>
              <p className="text-xs text-surface-400">STEP {stepNum}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressTabs({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="border-b border-surface-200">
      <div className="flex">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;

          return (
            <div
              key={step}
              className={`flex-1 py-3 text-center text-xs font-medium uppercase tracking-wide transition-colors ${
                isActive
                  ? 'text-primary-600 border-b-2 border-primary-500 -mb-px'
                  : isCompleted
                    ? 'text-primary-500'
                    : 'text-surface-400'
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Step 1: General Info
// ============================================

interface Step1Props {
  batchName: string;
  setBatchName: (name: string) => void;
  selectedCourse: string;
  setSelectedCourse: (id: string) => void;
  courses: Course[];
  onCancel: () => void;
  onNext: () => void;
}

function Step1GeneralInfo({
  batchName, setBatchName,
  selectedCourse, setSelectedCourse,
  courses, onCancel, onNext,
}: Step1Props) {
  const canProceed = batchName.trim().length > 0;

  return (
    <div className="flex flex-col min-h-[600px]">
      {/* Header */}
      <div className="text-center py-8 px-6">
        <h1 className="text-2xl font-bold text-surface-900">Create New Batch</h1>
        <p className="text-surface-500 mt-2 max-w-md mx-auto">
          Set the foundation for your grading session. Provide the basic details below to get started.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="bg-surface-50 border-y border-surface-200">
        <StepIndicator currentStep={1} steps={['General Info', 'Context & Rubric', 'Upload Students']} />
      </div>

      {/* Form */}
      <div className="flex-1 p-8 max-w-lg mx-auto w-full">
        {/* Batch Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-surface-900 mb-2">Batch Name</label>
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="e.g., Fall 2023 Finals - Public Speaking"
            className="w-full px-4 py-3 border border-surface-200 rounded-lg text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-xs text-surface-400 mt-1.5">
            Use a descriptive name that&apos;s easy to identify later.
          </p>
        </div>

        {/* Select Course */}
        <div>
          <label className="block text-sm font-medium text-surface-900 mb-2">Select Course</label>
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full px-4 py-3 border border-surface-200 rounded-lg text-surface-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
          >
            <option value="">Choose an active course...</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-surface-200 px-8 py-4 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 text-surface-600 hover:text-surface-800"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Continue to Step 2
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Help Footer */}
      <div className="text-center py-4 text-sm text-surface-400">
        Questions? Visit our <span className="text-primary-500 hover:underline cursor-pointer">Help Center</span> or contact support.
      </div>
    </div>
  );
}

// ============================================
// Step 2: Context & Rubric
// ============================================

interface Step2Props {
  classContext: string;
  setClassContext: (context: string) => void;
  selectedRubric: string;
  setSelectedRubric: (id: string) => void;
  rubrics: Rubric[];
  customRubric: Rubric | null;
  setCustomRubric: (rubric: Rubric | null) => void;
  onBack: () => void;
  onNext: () => void;
}

function Step2ContextRubric({
  classContext, setClassContext,
  selectedRubric, setSelectedRubric,
  rubrics, customRubric, setCustomRubric,
  onBack, onNext,
}: Step2Props) {
  const [rubricMode, setRubricMode] = useState<'upload' | 'select' | 'manual'>('upload');
  const [isParsingRubric, setIsParsingRubric] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const rubricFileInputRef = useRef<HTMLInputElement>(null);

  const handleRubricUpload = async (file: File) => {
    setIsParsingRubric(true);
    setParseError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/context/parse-rubric', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.criteria) {
        const parsed: Rubric = {
          id: 'custom-uploaded',
          name: file.name.replace(/\.[^.]+$/, ''),
          totalPoints: data.totalPoints || data.criteria.reduce((sum: number, c: { weight: number }) => sum + (c.weight || 0), 0),
          criteria: data.criteria.map((c: { name: string; description: string; weight: number; levels?: Array<{ score: number; label: string; description: string }> }) => ({
            name: c.name,
            description: c.description || '',
            points: c.weight || 0,
            levels: c.levels || defaultLevels,
          })),
        };
        setCustomRubric(parsed);
        setSelectedRubric('custom-uploaded');
      } else {
        setParseError(data.error || 'Failed to parse rubric');
      }
    } catch (err) {
      setParseError('Failed to upload rubric');
      console.error(err);
    } finally {
      setIsParsingRubric(false);
    }
  };

  const allRubrics = customRubric ? [customRubric, ...rubrics] : rubrics;
  const currentRubric = allRubrics.find(r => r.id === selectedRubric);

  return (
    <div className="flex flex-col min-h-[600px]">
      {/* Header */}
      <div className="px-8 py-4 border-b border-surface-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">New Batch Wizard</h2>
        </div>
        <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
          Step 2 of 3
        </span>
      </div>

      {/* Progress Tabs */}
      <ProgressTabs currentStep={2} steps={['Details', 'Context & Rubric', 'Review']} />

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <h1 className="text-2xl font-bold text-surface-900 mb-2">Step 2: Context & Rubric</h1>
        <p className="text-surface-500 mb-8">
          Provide the necessary context for the AI and select the rubric you&apos;d like to use for this batch of presentations.
        </p>

        {/* Class Context */}
        <div className="bg-white border border-surface-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-6 h-6 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900">Class Context</h3>
              <p className="text-sm text-surface-500">
                Provide lecture notes, specific instructions, or grading constraints that the AI should consider.
              </p>
            </div>
          </div>
          <textarea
            value={classContext}
            onChange={(e) => setClassContext(e.target.value)}
            rows={4}
            placeholder="e.g. The presentation should focus on the economic impacts of the 1920s. Grade harshly on sources but be lenient on public speaking anxiety..."
            className="w-full px-4 py-3 border border-surface-200 rounded-lg text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
          />
          <p className="text-xs text-surface-400 mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            Changes saved automatically
          </p>
        </div>

        {/* Select Rubric */}
        <div className="bg-white border border-surface-200 rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-6 h-6 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900">Rubric</h3>
              <p className="text-sm text-surface-500">Upload a rubric file or select from existing templates</p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-2 mb-4">
            {[
              { id: 'upload', label: 'Upload Rubric' },
              { id: 'select', label: 'Use Template' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRubricMode(tab.id as typeof rubricMode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  rubricMode === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Upload Mode */}
          {rubricMode === 'upload' && (
            <div className="mb-4">
              <input
                ref={rubricFileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRubricUpload(file);
                }}
                className="hidden"
              />
              <div
                onClick={() => rubricFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isParsingRubric
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-surface-200 hover:border-primary-300 hover:bg-surface-50'
                }`}
              >
                {isParsingRubric ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    <p className="text-sm text-surface-600">Parsing rubric...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-surface-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-surface-700">Click to upload rubric</p>
                    <p className="text-xs text-surface-500 mt-1">Supports PDF, DOCX, DOC, TXT</p>
                  </>
                )}
              </div>
              {parseError && (
                <p className="text-sm text-red-600 mt-2">{parseError}</p>
              )}
              {customRubric && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700">Rubric parsed: {customRubric.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Select Mode */}
          {rubricMode === 'select' && (
            <select
              value={selectedRubric}
              onChange={(e) => setSelectedRubric(e.target.value)}
              className="w-full px-4 py-3 border border-surface-200 rounded-lg text-surface-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white mb-4"
            >
              <option value="">Choose a rubric template...</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>{rubric.name}</option>
              ))}
            </select>
          )}

          {/* Rubric Preview */}
          {currentRubric && (
            <>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Rubric Preview</h4>
              
              {/* Criteria with Levels */}
              <div className="space-y-4">
                {currentRubric.criteria.map((criterion) => (
                  <div key={criterion.name} className="border border-surface-200 rounded-xl overflow-hidden">
                    {/* Criterion Header */}
                    <div className="bg-surface-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <h5 className="font-semibold text-surface-900">{criterion.name}</h5>
                        <p className="text-xs text-surface-500">{criterion.description}</p>
                      </div>
                      <span className="text-sm font-bold text-primary-600">{criterion.points} pts</span>
                    </div>
                    
                    {/* Levels Grid */}
                    {criterion.levels && criterion.levels.length > 0 && (
                      <div className="p-3 grid grid-cols-4 gap-2">
                        {criterion.levels.map((level, idx) => (
                          <div
                            key={level.score}
                            className={`p-3 rounded-lg border text-sm ${
                              idx === criterion.levels!.length - 1
                                ? 'border-primary-200 bg-primary-50'
                                : 'border-surface-200 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-xs font-semibold ${
                                idx === criterion.levels!.length - 1 ? 'text-primary-600' : 'text-surface-500'
                              }`}>
                                {level.label} ({level.score})
                              </span>
                              {idx === criterion.levels!.length - 1 && (
                                <span className="w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-surface-600 leading-relaxed">{level.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Points */}
              <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-surface-200">
                <span className="text-sm font-semibold text-surface-700">Total Points</span>
                <span className="text-lg font-bold text-primary-600">{currentRubric.totalPoints}</span>
              </div>

              <button className="flex items-center gap-1.5 text-primary-600 text-sm font-medium mt-4 hover:text-primary-700">
                <Edit2 className="w-4 h-4" />
                Edit this rubric
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-surface-200 px-8 py-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 font-medium"
        >
          Back to Details
        </button>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Live Sync Active
          </span>
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium"
          >
            Continue to Review
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Step 3: Upload Files
// ============================================

interface Step3Props {
  files: QueuedFile[];
  setFiles: React.Dispatch<React.SetStateAction<QueuedFile[]>>;
  onBack: () => void;
  onComplete: () => void;
  isCreating: boolean;
}

function Step3Upload({ files, setFiles, onBack, onComplete, isCreating }: Step3Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const queuedFiles: QueuedFile[] = fileArray.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'waiting' as const,
    }));
    setFiles((prev) => [...prev, ...queuedFiles]);
  }, [setFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, [setFiles]);

  const clearAll = useCallback(() => {
    setFiles([]);
  }, [setFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const readyCount = files.filter(f => f.status === 'waiting' || f.status === 'complete').length;

  return (
    <div className="flex flex-col min-h-[600px]">
      {/* Breadcrumb Header */}
      <div className="px-8 py-4 border-b border-surface-200">
        <nav className="text-sm text-surface-500">
          <span className="hover:text-primary-600 cursor-pointer">Batches</span>
          <span className="mx-2">/</span>
          <span className="hover:text-primary-600 cursor-pointer">New Batch Wizard</span>
          <span className="mx-2">/</span>
          <span className="text-surface-900 font-medium">Upload & Finish</span>
        </nav>
      </div>

      {/* Title */}
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-surface-900 mb-1">Step 3: Upload Student Presentations</h1>
        <p className="text-surface-500">Final step: Add your media files to begin bulk processing.</p>
      </div>

      {/* Progress Tabs */}
      <div className="px-8 pb-6">
        <div className="flex gap-8 border-b border-surface-200">
          {['General Info', 'Rubric Selection', 'Upload & Finish'].map((tab, index) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium transition-colors ${
                index === 2
                  ? 'text-primary-600 border-b-2 border-primary-500 -mb-px'
                  : 'text-surface-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Zone */}
      <div className="px-8 flex-1">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            isDragging
              ? 'border-primary-400 bg-primary-50'
              : 'border-surface-200 hover:border-surface-300'
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
            <Cloud className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="font-semibold text-surface-900 mb-1">Drag and drop student files here</h3>
          <p className="text-sm text-surface-500 mb-4">
            Supports MP4, MOV, MP3, and WAV up to 500MB per file.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.mp3,.wav,.pdf,.pptx,.docx"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium"
          >
            Browse Files
          </button>
        </div>

        {/* Queued Files */}
        {files.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-surface-900">Queued Files ({files.length})</h3>
              <button onClick={clearAll} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    file.status === 'complete'
                      ? 'bg-emerald-50 border-emerald-200'
                      : file.status === 'error'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-surface-200'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    file.status === 'complete'
                      ? 'bg-emerald-100'
                      : file.status === 'uploading'
                        ? 'bg-primary-100'
                        : file.status === 'error'
                          ? 'bg-red-100'
                          : 'bg-surface-100'
                  }`}>
                    {file.status === 'complete' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    ) : file.status === 'uploading' ? (
                      <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                    ) : file.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-surface-500" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 truncate">{file.name}</p>
                    <p className="text-sm text-surface-500">
                      {formatFileSize(file.size)}
                      {file.status === 'complete' && ' • Upload complete'}
                      {file.status === 'waiting' && ' • Waiting...'}
                      {file.status === 'uploading' && ` • ${file.progress}%`}
                      {file.status === 'error' && ` • ${file.error || 'Upload failed'}`}
                    </p>
                  </div>

                  {/* Progress Bar (if uploading) */}
                  {file.status === 'uploading' && (
                    <div className="w-32">
                      <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 transition-all"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-surface-500 mt-1 text-right">{file.progress}%</p>
                    </div>
                  )}

                  {/* Remove Button */}
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 text-surface-400 hover:text-red-500 transition-colors"
                  >
                    {file.status === 'uploading' ? (
                      <X className="w-5 h-5" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 px-8">
        <div className="flex items-center justify-between text-sm text-surface-500 mb-4">
          <span>Total Size: {formatFileSize(totalSize)}</span>
          <span>Ready to process {readyCount} presentation{readyCount !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center justify-between pb-6">
          <button
            onClick={onBack}
            className="px-6 py-2.5 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 font-medium"
          >
            Back
          </button>
          <button
            onClick={onComplete}
            disabled={files.length === 0 || isCreating}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create & Process Batch
              </>
            )}
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-surface-900 mb-1">Bulk Processing</h4>
            <p className="text-sm text-surface-600">
              Babblet will automatically transcribe and apply the selected rubric to each uploaded file.
              You&apos;ll receive a notification once the batch processing is complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Wizard Component
// ============================================

export default function BatchWizard({ isOpen, onClose, onComplete, courses, defaultCourseId }: BatchWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  // Step 1 state
  const [batchName, setBatchName] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(defaultCourseId || '');

  // Step 2 state
  const [classContext, setClassContext] = useState('');
  const [selectedRubric, setSelectedRubric] = useState(defaultRubrics[0].id);
  const [customRubric, setCustomRubric] = useState<Rubric | null>(null);

  // Step 3 state
  const [files, setFiles] = useState<QueuedFile[]>([]);

  // Update selected course when defaultCourseId changes
  useEffect(() => {
    if (isOpen && defaultCourseId) {
      setSelectedCourse(defaultCourseId);
    }
  }, [isOpen, defaultCourseId]);

  // Reset state when wizard closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setBatchName('');
      setSelectedCourse('');
      setClassContext('');
      setSelectedRubric(defaultRubrics[0].id);
      setCustomRubric(null);
      setFiles([]);
      setIsCreating(false);
    }
  }, [isOpen]);

  const handleComplete = async () => {
    setIsCreating(true);

    try {
      // Create the batch
      const response = await fetch('/api/bulk/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName,
          courseId: selectedCourse || undefined,
          context: classContext,
          rubricId: selectedRubric,
          customRubric: customRubric ? {
            name: customRubric.name,
            criteria: customRubric.criteria,
            totalPoints: customRubric.totalPoints,
          } : undefined,
        }),
      });

      const data = await response.json();
      if (!data.success || !data.batchId) {
        throw new Error(data.error || 'Failed to create batch');
      }

      const batchId = data.batchId;

      // Upload files
      for (const queuedFile of files) {
        setFiles((prev) =>
          prev.map((f) => (f.id === queuedFile.id ? { ...f, status: 'uploading' as const, progress: 0 } : f))
        );

        try {
          // Get presigned URL
          const presignRes = await fetch('/api/bulk/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: queuedFile.name,
              fileType: queuedFile.file.type,
              fileSize: queuedFile.size,
            }),
          });
          const presignData = await presignRes.json();

          if (!presignData.success) {
            throw new Error(presignData.error || 'Failed to get upload URL');
          }

          // Upload to R2
          const uploadRes = await fetch(presignData.url, {
            method: 'PUT',
            body: queuedFile.file,
            headers: { 'Content-Type': queuedFile.file.type },
          });

          if (!uploadRes.ok) {
            throw new Error('Upload failed');
          }

          // Enqueue for processing
          await fetch('/api/bulk/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId,
              fileName: queuedFile.name,
              fileKey: presignData.key,
              fileSize: queuedFile.size,
            }),
          });

          setFiles((prev) =>
            prev.map((f) => (f.id === queuedFile.id ? { ...f, status: 'complete' as const, progress: 100 } : f))
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? { ...f, status: 'error' as const, error: err instanceof Error ? err.message : 'Upload failed' }
                : f
            )
          );
        }
      }

      // Complete
      onComplete(batchId);
    } catch (error) {
      console.error('Batch creation error:', error);
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {currentStep === 1 && (
            <Step1GeneralInfo
              batchName={batchName}
              setBatchName={setBatchName}
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
              courses={courses}
              onCancel={onClose}
              onNext={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <Step2ContextRubric
              classContext={classContext}
              setClassContext={setClassContext}
              selectedRubric={selectedRubric}
              setSelectedRubric={setSelectedRubric}
              rubrics={defaultRubrics}
              customRubric={customRubric}
              setCustomRubric={setCustomRubric}
              onBack={() => setCurrentStep(1)}
              onNext={() => setCurrentStep(3)}
            />
          )}

          {currentStep === 3 && (
            <Step3Upload
              files={files}
              setFiles={setFiles}
              onBack={() => setCurrentStep(2)}
              onComplete={handleComplete}
              isCreating={isCreating}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
