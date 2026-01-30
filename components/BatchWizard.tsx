'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowRight, Check, Upload, Plus, Minus,
  FileText, Trash2, Cloud, Loader2, CheckCircle, AlertCircle, HelpCircle,
  Edit2, Save, Video, Music, FileImage, File
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface Course {
  id: string;
  name: string;
}

interface RubricLevel {
  score: number; // For single scores, or the midpoint/representative score
  minScore?: number; // For ranges: minimum score
  maxScore?: number; // For ranges: maximum score
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
  onComplete: (batchId: string, expectedFileCount?: number) => void;
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

function getFileTypeInfo(filename: string): { type: 'video' | 'audio' | 'document' | 'image' | 'other'; label: string; color: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return { type: 'video', label: 'Video', color: 'bg-purple-100 text-purple-700' };
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
    return { type: 'audio', label: 'Audio', color: 'bg-amber-100 text-amber-700' };
  }
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(ext)) {
    return { type: 'document', label: ext.toUpperCase(), color: 'bg-blue-100 text-blue-700' };
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return { type: 'image', label: 'Image', color: 'bg-emerald-100 text-emerald-700' };
  }
  return { type: 'other', label: ext.toUpperCase() || 'File', color: 'bg-surface-100 text-surface-700' };
}

function getFileIcon(type: 'video' | 'audio' | 'document' | 'image' | 'other') {
  switch (type) {
    case 'video': return Video;
    case 'audio': return Music;
    case 'document': return FileText;
    case 'image': return FileImage;
    default: return File;
  }
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
  const [rubricMode, setRubricMode] = useState<'upload' | 'select' | 'text'>('upload');
  const [isParsingRubric, setIsParsingRubric] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRubric, setEditingRubric] = useState<Rubric | null>(null);
  const [rubricText, setRubricText] = useState('');
  const rubricFileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    const allRubrics = customRubric ? [customRubric, ...rubrics] : rubrics;
    const rubricToEdit = allRubrics.find(r => r.id === selectedRubric);
    if (rubricToEdit) {
      setEditingRubric(JSON.parse(JSON.stringify(rubricToEdit))); // Deep clone
      setIsEditing(true);
    }
  };

  const saveEditing = () => {
    if (editingRubric) {
      // Calculate total points
      editingRubric.totalPoints = editingRubric.criteria.reduce((sum, c) => sum + c.points, 0);
      setCustomRubric(editingRubric);
      setSelectedRubric(editingRubric.id);
      setIsEditing(false);
      setEditingRubric(null);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingRubric(null);
  };

  const updateCriterion = (index: number, field: keyof RubricCriterion, value: string | number) => {
    if (!editingRubric) return;
    const updated = { ...editingRubric };
    updated.criteria = [...updated.criteria];
    updated.criteria[index] = { ...updated.criteria[index], [field]: value };
    setEditingRubric(updated);
  };

  const updateLevel = (criterionIndex: number, levelIndex: number, field: keyof RubricLevel, value: string | number) => {
    if (!editingRubric) return;
    const updated = { ...editingRubric };
    updated.criteria = [...updated.criteria];
    const criterion = { ...updated.criteria[criterionIndex] };
    if (criterion.levels) {
      criterion.levels = [...criterion.levels];
      criterion.levels[levelIndex] = { ...criterion.levels[levelIndex], [field]: value };
      updated.criteria[criterionIndex] = criterion;
      setEditingRubric(updated);
    }
  };

  const addCriterion = () => {
    if (!editingRubric) return;
    const updated = { ...editingRubric };
    updated.criteria = [...updated.criteria, {
      name: 'New Criterion',
      description: '',
      points: 10,
      levels: defaultLevels,
    }];
    setEditingRubric(updated);
  };

  const removeCriterion = (index: number) => {
    if (!editingRubric || editingRubric.criteria.length <= 1) return;
    const updated = { ...editingRubric };
    updated.criteria = updated.criteria.filter((_, i) => i !== index);
    setEditingRubric(updated);
  };

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

  const handleRubricTextParse = async () => {
    if (!rubricText.trim()) {
      setParseError('Please enter rubric text');
      return;
    }
    
    setIsParsingRubric(true);
    setParseError(null);

    try {
      // Create a text blob and send as file
      const textBlob = new Blob([rubricText], { type: 'text/plain' });
      
      const formData = new FormData();
      formData.append('file', textBlob, 'rubric.txt');

      const res = await fetch('/api/context/parse-rubric', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.criteria) {
        const parsed: Rubric = {
          id: 'custom-text',
          name: 'Custom Rubric',
          totalPoints: data.totalPoints || data.criteria.reduce((sum: number, c: { weight: number }) => sum + (c.weight || 0), 0),
          criteria: data.criteria.map((c: { name: string; description: string; weight: number; levels?: Array<{ score: number; label: string; description: string }> }) => ({
            name: c.name,
            description: c.description || '',
            points: c.weight || 0,
            levels: c.levels || defaultLevels,
          })),
        };
        setCustomRubric(parsed);
        setSelectedRubric('custom-text');
      } else {
        setParseError(data.error || 'Failed to parse rubric text');
      }
    } catch (err) {
      setParseError('Failed to parse rubric text');
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
          Provide the necessary context and select the rubric you&apos;d like to use for this batch of presentations.
        </p>

        {/* Class Context */}
        <div className="bg-white border border-surface-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-6 h-6 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900">
                Class Context <span className="text-surface-400 font-normal text-sm">(optional)</span>
              </h3>
              <p className="text-sm text-surface-500">
                Optionally provide lecture notes, specific instructions, or grading constraints that Babblet should consider. You can skip this if you don&apos;t have any specific context.
              </p>
            </div>
          </div>
          <textarea
            value={classContext}
            onChange={(e) => setClassContext(e.target.value)}
            rows={4}
            placeholder="e.g. The presentation should focus on the economic impacts of the 1920s. Grade harshly on sources but be lenient on public speaking anxiety... (Leave blank to use default grading behavior)"
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
              { id: 'upload', label: 'Upload File' },
              { id: 'text', label: 'Paste Text' },
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

          {/* Text Mode */}
          {rubricMode === 'text' && (
            <div className="mb-4">
              <textarea
                value={rubricText}
                onChange={(e) => setRubricText(e.target.value)}
                rows={8}
                placeholder={`Paste your rubric text here. Example format:

Content Quality (40 points)
- Excellent (4): Demonstrates deep understanding with accurate information
- Good (3): Shows solid understanding with minor gaps
- Fair (2): Basic understanding but missing key elements
- Poor (1): Significant gaps in understanding

Presentation Skills (30 points)
- Clear delivery and good eye contact
- Appropriate pacing and volume

Organization (30 points)
- Logical structure with clear introduction and conclusion`}
                className="w-full px-4 py-3 border border-surface-200 rounded-lg text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-sm font-mono"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-surface-500">
                  Babblet will automatically parse criteria, points, and levels from your text
                </p>
                <button
                  onClick={handleRubricTextParse}
                  disabled={isParsingRubric || !rubricText.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isParsingRubric ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    'Parse Rubric'
                  )}
                </button>
              </div>
              {parseError && (
                <p className="text-sm text-red-600 mt-2">{parseError}</p>
              )}
              {customRubric && selectedRubric === 'custom-text' && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700">Rubric parsed: {customRubric.criteria.length} criteria found</span>
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

          {/* Rubric Preview / Edit Mode */}
          {(currentRubric || isEditing) && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
                  {isEditing ? 'Edit Rubric' : 'Rubric Preview'}
                </h4>
                {isEditing && (
                  <div className="flex gap-2">
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1.5 text-sm text-surface-600 hover:text-surface-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Changes
                    </button>
                  </div>
                )}
              </div>
              
              {/* Editing Mode */}
              {isEditing && editingRubric && (
                <div className="space-y-4">
                  {/* Rubric Name */}
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">Rubric Name</label>
                    <input
                      type="text"
                      value={editingRubric.name}
                      onChange={(e) => setEditingRubric({ ...editingRubric, name: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Criteria */}
                  {editingRubric.criteria.map((criterion, cIdx) => (
                    <div key={cIdx} className="border border-surface-200 rounded-xl overflow-hidden">
                      <div className="bg-surface-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={criterion.name}
                              onChange={(e) => updateCriterion(cIdx, 'name', e.target.value)}
                              className="w-full px-3 py-1.5 border border-surface-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary-500"
                              placeholder="Criterion name"
                            />
                            <input
                              type="text"
                              value={criterion.description}
                              onChange={(e) => updateCriterion(cIdx, 'description', e.target.value)}
                              className="w-full px-3 py-1.5 border border-surface-200 rounded-lg text-xs text-surface-600 focus:ring-2 focus:ring-primary-500"
                              placeholder="Description"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={criterion.points}
                              onChange={(e) => updateCriterion(cIdx, 'points', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1.5 border border-surface-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-primary-500"
                            />
                            <span className="text-xs text-surface-500">pts</span>
                            <button
                              onClick={() => removeCriterion(cIdx)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              disabled={editingRubric.criteria.length <= 1}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Editable Levels */}
                      {criterion.levels && (
                        <div className="p-3 grid grid-cols-4 gap-2">
                          {criterion.levels.map((level, lIdx) => (
                            <div key={lIdx} className="p-2 rounded-lg border border-surface-200 bg-white space-y-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={level.label}
                                  onChange={(e) => updateLevel(cIdx, lIdx, 'label', e.target.value)}
                                  className="flex-1 px-2 py-1 border border-surface-200 rounded text-xs font-medium focus:ring-1 focus:ring-primary-500"
                                />
                                <input
                                  type="number"
                                  value={level.score}
                                  onChange={(e) => updateLevel(cIdx, lIdx, 'score', parseInt(e.target.value) || 0)}
                                  className="w-10 px-1 py-1 border border-surface-200 rounded text-xs text-center focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                              <textarea
                                value={level.description}
                                onChange={(e) => updateLevel(cIdx, lIdx, 'description', e.target.value)}
                                className="w-full px-2 py-1 border border-surface-200 rounded text-xs text-surface-600 resize-none focus:ring-1 focus:ring-primary-500"
                                rows={2}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add Criterion Button */}
                  <button
                    onClick={addCriterion}
                    className="flex items-center gap-2 w-full py-3 border-2 border-dashed border-surface-200 rounded-xl text-surface-500 hover:border-primary-300 hover:text-primary-600 text-sm font-medium justify-center"
                  >
                    <Plus className="w-4 h-4" />
                    Add Criterion
                  </button>

                  {/* Total Points */}
                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-200">
                    <span className="text-sm font-semibold text-surface-700">Total Points</span>
                    <span className="text-lg font-bold text-primary-600">
                      {editingRubric.criteria.reduce((sum, c) => sum + c.points, 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* View Mode */}
              {!isEditing && currentRubric && (
                <>
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
                                    {level.label} ({level.minScore !== undefined && level.maxScore !== undefined 
                                      ? `${level.minScore}-${level.maxScore}` 
                                      : level.score})
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

                  <button 
                    onClick={startEditing}
                    className="flex items-center gap-1.5 text-primary-600 text-sm font-medium mt-4 hover:text-primary-700"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit this rubric
                  </button>
                </>
              )}
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
    <div className="flex flex-col h-[600px]">
      {/* Breadcrumb Header */}
      <div className="px-8 py-4 border-b border-surface-200 flex-shrink-0">
        <nav className="text-sm text-surface-500">
          <span className="hover:text-primary-600 cursor-pointer">Batches</span>
          <span className="mx-2">/</span>
          <span className="hover:text-primary-600 cursor-pointer">New Batch Wizard</span>
          <span className="mx-2">/</span>
          <span className="text-surface-900 font-medium">Upload & Finish</span>
        </nav>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
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

        {/* Upload Zone & Files - Side by side when files exist */}
        <div className="px-8">
          <div className={`grid gap-6 ${files.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* Dropzone - compact when files exist */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-xl text-center transition-colors ${
                files.length > 0 ? 'p-6' : 'p-12'
              } ${
                isDragging
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-surface-200 hover:border-surface-300'
              }`}
            >
              <div className={`rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3 ${
                files.length > 0 ? 'w-12 h-12' : 'w-16 h-16 mb-4'
              }`}>
                <Cloud className={files.length > 0 ? 'w-6 h-6 text-primary-500' : 'w-8 h-8 text-primary-500'} />
              </div>
              <h3 className={`font-semibold text-surface-900 mb-1 ${files.length > 0 ? 'text-sm' : ''}`}>
                {files.length > 0 ? 'Add more files' : 'Drag and drop student files here'}
              </h3>
              <p className={`text-surface-500 mb-3 ${files.length > 0 ? 'text-xs' : 'text-sm mb-4'}`}>
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
                className={`bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium ${
                  files.length > 0 ? 'px-4 py-2 text-sm' : 'px-6 py-2.5'
                }`}
              >
                Browse Files
              </button>
            </div>

            {/* Queued Files */}
            {files.length > 0 && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-surface-900 text-sm">Uploaded Files</h3>
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                      {files.length}
                    </span>
                  </div>
                  <button 
                    onClick={clearAll} 
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                </div>
                
                {/* Summary by type - compact */}
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {(() => {
                    const videoCount = files.filter(f => getFileTypeInfo(f.name).type === 'video').length;
                    const audioCount = files.filter(f => getFileTypeInfo(f.name).type === 'audio').length;
                    const docCount = files.filter(f => getFileTypeInfo(f.name).type === 'document').length;
                    return (
                      <>
                        {videoCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                            <Video className="w-3 h-3" />
                            {videoCount} video{videoCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {audioCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                            <Music className="w-3 h-3" />
                            {audioCount} audio
                          </span>
                        )}
                        {docCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                            <FileText className="w-3 h-3" />
                            {docCount} doc{docCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                <div className="space-y-1 max-h-40 overflow-y-auto flex-1">
                  {files.map((file) => {
                    const fileTypeInfo = getFileTypeInfo(file.name);
                    const FileIcon = getFileIcon(fileTypeInfo.type);
                    
                    return (
                      <div
                        key={file.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          file.status === 'complete'
                            ? 'bg-emerald-50 border-emerald-200'
                            : file.status === 'error'
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-surface-200'
                        }`}
                      >
                        {/* File Type Icon - compact */}
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                          file.status === 'complete'
                            ? 'bg-emerald-100'
                            : file.status === 'uploading'
                              ? 'bg-primary-100'
                              : file.status === 'error'
                                ? 'bg-red-100'
                                : fileTypeInfo.type === 'video' 
                                  ? 'bg-purple-100'
                                  : fileTypeInfo.type === 'audio'
                                    ? 'bg-amber-100'
                                    : 'bg-surface-100'
                        }`}>
                          {file.status === 'complete' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          ) : file.status === 'uploading' ? (
                            <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                          ) : file.status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <FileIcon className={`w-4 h-4 ${
                              fileTypeInfo.type === 'video' ? 'text-purple-600' :
                              fileTypeInfo.type === 'audio' ? 'text-amber-600' :
                              'text-surface-500'
                            }`} />
                          )}
                        </div>

                        {/* File Info - compact */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-900 truncate">{file.name}</p>
                          <p className="text-xs text-surface-500">
                            {formatFileSize(file.size)}
                            {file.status === 'complete' && <span className="text-emerald-600"> • Ready</span>}
                            {file.status === 'uploading' && <span className="text-primary-600"> • {file.progress}%</span>}
                            {file.status === 'error' && <span className="text-red-600"> • Failed</span>}
                          </p>
                        </div>

                        {/* Delete Button - compact */}
                        <button
                          onClick={() => removeFile(file.id)}
                          className="p-1.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded transition-all flex-shrink-0"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Card - more compact */}
        <div className="px-8 pb-4">
          <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 flex items-start gap-3">
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

      {/* Footer - Fixed at bottom */}
      <div className="border-t border-surface-200 px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between text-sm text-surface-500 mb-3">
          <span>Total Size: {formatFileSize(totalSize)}</span>
          <span>Ready to process {readyCount} presentation{readyCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center justify-between">
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
      // Create the batch with expected upload count for persistent tracking
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
          // Store expected file count in batch for consistent progress tracking
          expectedUploadCount: files.length,
        }),
      });

      const data = await response.json();
      if (!data.success || !data.batchId) {
        throw new Error(data.error || 'Failed to create batch');
      }

      const batchId = data.batchId;
      console.log(`[BatchWizard] Created batch ${batchId}, will upload ${files.length} files in background`);

      // Capture files before closing wizard (they'll be cleared on close)
      const filesToUpload = [...files];

      // Close wizard and navigate to assignment page IMMEDIATELY
      // Files will upload in background - pass expected count for progress display
      onComplete(batchId, filesToUpload.length);

      // Upload files in background (fire and forget)
      // This continues even after the wizard component unmounts
      (async () => {
        let successfulUploads = 0;
        
        for (const queuedFile of filesToUpload) {
          try {
            console.log(`[BatchWizard Background] Uploading ${queuedFile.name}`);
            
            // Get presigned URL
            const presignRes = await fetch('/api/bulk/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                batchId,
                filename: queuedFile.name,
                contentType: queuedFile.file.type,
              }),
            });
            const presignData = await presignRes.json();

            if (!presignData.success) {
              console.error(`[BatchWizard Background] Presign failed for ${queuedFile.name}:`, presignData.error);
              continue;
            }

            // Upload to R2
            const uploadRes = await fetch(presignData.uploadUrl, {
              method: 'PUT',
              body: queuedFile.file,
              headers: { 'Content-Type': queuedFile.file.type },
            });

            if (!uploadRes.ok) {
              console.error(`[BatchWizard Background] R2 upload failed for ${queuedFile.name}: ${uploadRes.status}`);
              continue;
            }

            // Enqueue for processing
            const enqueueRes = await fetch('/api/bulk/enqueue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                batchId,
                originalFilename: queuedFile.name,
                fileKey: presignData.fileKey,
                fileSize: queuedFile.size,
                mimeType: queuedFile.file.type,
              }),
            });
            const enqueueData = await enqueueRes.json();

            if (enqueueData.success) {
              successfulUploads++;
              console.log(`[BatchWizard Background] Enqueued ${queuedFile.name}`);
            }
          } catch (err) {
            console.error(`[BatchWizard Background] Error uploading ${queuedFile.name}:`, err);
          }
        }

        console.log(`[BatchWizard Background] Completed: ${successfulUploads}/${filesToUpload.length} files uploaded`);
      })();

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
