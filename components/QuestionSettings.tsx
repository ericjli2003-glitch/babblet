'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  X,
  HelpCircle,
  Brain,
  Expand,
  Target,
  FileText,
  Sliders,
  Check,
  Upload,
  File,
  Trash2,
} from 'lucide-react';

interface QuestionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    maxQuestions: number;
    assignmentContext: string;
    rubricCriteria: string;
    priorities: {
      clarifying: number;
      criticalThinking: number;
      expansion: number;
    };
    focusAreas: string[];
  };
  onSettingsChange: (settings: QuestionSettingsProps['settings']) => void;
}

const priorityLabels = ['None', 'Some', 'Focus'];

export default function QuestionSettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: QuestionSettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [newFocusArea, setNewFocusArea] = useState('');

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const addFocusArea = () => {
    if (newFocusArea.trim() && !localSettings.focusAreas.includes(newFocusArea.trim())) {
      setLocalSettings({
        ...localSettings,
        focusAreas: [...localSettings.focusAreas, newFocusArea.trim()],
      });
      setNewFocusArea('');
    }
  };

  const removeFocusArea = (area: string) => {
    setLocalSettings({
      ...localSettings,
      focusAreas: localSettings.focusAreas.filter(a => a !== area),
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl bg-white rounded-3xl shadow-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900">Question Settings</h2>
                  <p className="text-sm text-surface-500">Customize AI question generation</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Max Questions */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-3">
                  <Target className="w-4 h-4" />
                  Maximum Questions
                </label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20, 30].map((num) => (
                    <button
                      key={num}
                      onClick={() => setLocalSettings({ ...localSettings, maxQuestions: num })}
                      className={`px-4 py-2 rounded-xl font-medium transition-all ${localSettings.maxQuestions === num
                          ? 'bg-primary-500 text-white shadow-md'
                          : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                        }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-surface-400 mt-2">
                  Total questions to show during the session
                </p>
              </div>

              {/* Question Type Priorities */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-3">
                  <Sliders className="w-4 h-4" />
                  Question Type Priorities
                </label>
                <div className="space-y-3">
                  {[
                    { key: 'clarifying' as const, label: 'Clarifying Questions', icon: HelpCircle, color: 'blue' },
                    { key: 'criticalThinking' as const, label: 'Critical Thinking', icon: Brain, color: 'purple' },
                    { key: 'expansion' as const, label: 'Expansion Questions', icon: Expand, color: 'emerald' },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-surface-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 text-${color}-500`} />
                        <span className="text-sm text-surface-700">{label}</span>
                      </div>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((priority) => (
                          <button
                            key={priority}
                            onClick={() => setLocalSettings({
                              ...localSettings,
                              priorities: { ...localSettings.priorities, [key]: priority },
                            })}
                            className={`px-3 py-1 text-xs rounded-lg transition-all ${localSettings.priorities[key] === priority
                                ? priority === 0
                                  ? 'bg-surface-400 text-white'
                                  : priority === 1
                                    ? 'bg-primary-400 text-white'
                                    : 'bg-primary-600 text-white'
                                : 'bg-surface-200 text-surface-500 hover:bg-surface-300'
                              }`}
                          >
                            {priorityLabels[priority]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assignment Context */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-2">
                  <FileText className="w-4 h-4" />
                  Assignment Context
                  <span className="text-xs text-surface-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={localSettings.assignmentContext}
                  onChange={(e) => setLocalSettings({ ...localSettings, assignmentContext: e.target.value })}
                  placeholder="Paste the assignment prompt or describe what students should cover..."
                  className="w-full h-24 px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                />
              </div>

              {/* Rubric/Criteria */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-2">
                  <Target className="w-4 h-4" />
                  Grading Rubric / Criteria
                  <span className="text-xs text-surface-400 font-normal">(paste or upload)</span>
                </label>

                {/* Upload rubric file */}
                <div className="mb-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-surface-300 rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-colors">
                    <Upload className="w-4 h-4 text-surface-500" />
                    <span className="text-sm text-surface-600">Upload rubric file (TXT, PDF, DOCX)</span>
                    <input
                      type="file"
                      accept=".txt,.pdf,.docx,.doc"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            // For TXT files, read directly
                            if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                              const text = await file.text();
                              setLocalSettings({ ...localSettings, rubricCriteria: text });
                            } else {
                              // For other files, just note the filename (would need server-side parsing for PDF/DOCX)
                              const text = await file.text();
                              setLocalSettings({
                                ...localSettings,
                                rubricCriteria: `[Uploaded: ${file.name}]\n\n${text.slice(0, 5000)}`,
                              });
                            }
                          } catch (err) {
                            console.error('Error reading file:', err);
                            alert('Could not read file. Please try pasting the text directly.');
                          }
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Show uploaded rubric preview or text area */}
                {localSettings.rubricCriteria && localSettings.rubricCriteria.startsWith('[Uploaded:') ? (
                  <div className="p-4 bg-surface-50 border border-surface-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-primary-500" />
                        <span className="text-sm font-medium text-surface-700">
                          {localSettings.rubricCriteria.match(/\[Uploaded: (.+?)\]/)?.[1] || 'Rubric file'}
                        </span>
                      </div>
                      <button
                        onClick={() => setLocalSettings({ ...localSettings, rubricCriteria: '' })}
                        className="p-1 text-surface-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-surface-500">
                      {localSettings.rubricCriteria.length} characters loaded
                    </p>
                  </div>
                ) : (
                  <textarea
                    value={localSettings.rubricCriteria}
                    onChange={(e) => setLocalSettings({ ...localSettings, rubricCriteria: e.target.value })}
                    placeholder="Paste your grading rubric here. E.g.:&#10;&#10;Content (40%): Clear thesis, accurate information, logical organization&#10;Delivery (30%): Clear speaking, appropriate pacing, eye contact&#10;Evidence (30%): Credible sources, relevant examples, proper citations"
                    className="w-full h-32 px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                  />
                )}

                <p className="text-xs text-surface-400 mt-2">
                  This rubric will be used to evaluate the presentation and generate targeted questions
                </p>
              </div>

              {/* Focus Areas */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 mb-2">
                  <Target className="w-4 h-4" />
                  Focus Areas
                  <span className="text-xs text-surface-400 font-normal">(topics to emphasize)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newFocusArea}
                    onChange={(e) => setNewFocusArea(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFocusArea()}
                    placeholder="Add a focus topic..."
                    className="flex-1 px-4 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <button
                    onClick={addFocusArea}
                    className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium hover:bg-primary-600 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {localSettings.focusAreas.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {localSettings.focusAreas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm"
                      >
                        {area}
                        <button
                          onClick={() => removeFocusArea(area)}
                          className="p-0.5 hover:bg-primary-200 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 bg-surface-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-surface-600 hover:text-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-primary text-white font-medium rounded-xl hover:shadow-lg transition-shadow"
              >
                <Check className="w-4 h-4" />
                Save Settings
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

