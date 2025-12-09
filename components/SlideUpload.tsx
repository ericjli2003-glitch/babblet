'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileImage,
  FileText,
  X,
  CheckCircle2,
  Loader2,
  Presentation,
} from 'lucide-react';

interface SlideUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  onAnalysisComplete?: (data: unknown) => void;
}

export default function SlideUpload({
  onFileSelect,
  selectedFile,
  onAnalysisComplete,
}: SlideUploadProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'complete' | 'error'>('idle');

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const validTypes = [
          'application/pdf',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/png',
          'image/jpeg',
          'image/jpg',
        ];
        
        if (validTypes.includes(file.type) || 
            file.name.endsWith('.pdf') || 
            file.name.endsWith('.ppt') || 
            file.name.endsWith('.pptx')) {
          onFileSelect(file);
          setAnalysisStatus('idle');
        }
      }
    },
    [onFileSelect]
  );

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null);
    setAnalysisStatus('idle');
  }, [onFileSelect]);

  const handleAnalyzeSlides = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setAnalysisStatus('analyzing');

    try {
      const formData = new FormData();
      formData.append('slides', selectedFile);

      const response = await fetch('/api/analyze-slides', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();
      setAnalysisStatus('complete');
      onAnalysisComplete?.(data);
    } catch (error) {
      console.error('Slide analysis error:', error);
      setAnalysisStatus('error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return FileImage;
    if (selectedFile.type.includes('pdf')) return FileText;
    if (selectedFile.type.includes('presentation') || selectedFile.name.endsWith('.ppt') || selectedFile.name.endsWith('.pptx')) {
      return Presentation;
    }
    return FileImage;
  };

  const FileIcon = getFileIcon();

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-surface-700">
        Presentation Slides{' '}
        <span className="text-surface-400 font-normal">(optional - enhances analysis)</span>
      </label>

      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="upload-area"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative border-2 border-dashed border-surface-300 rounded-2xl p-6 text-center hover:border-primary-400 hover:bg-surface-50 transition-colors"
          >
            <input
              type="file"
              accept=".pdf,.ppt,.pptx,image/*"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <FileImage className="w-10 h-10 text-surface-400 mx-auto mb-2" />
            <p className="text-surface-600 text-sm">
              Upload slides for enhanced AI analysis
            </p>
            <p className="text-xs text-surface-400 mt-1">
              PDF, PPT, PPTX, or images
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-gradient-subtle rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white shadow-soft flex items-center justify-center">
                  <FileIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-surface-900 text-sm">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-surface-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {analysisStatus === 'complete' && (
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">Analyzed</span>
                  </div>
                )}
                
                {analysisStatus !== 'complete' && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAnalyzeSlides}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-white rounded-lg shadow-soft hover:shadow-soft-lg transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Pre-analyze'
                    )}
                  </motion.button>
                )}

                <button
                  onClick={handleRemoveFile}
                  className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-white rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {analysisStatus === 'analyzing' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 pt-3 border-t border-surface-200"
              >
                <div className="flex items-center gap-2 text-sm text-surface-600">
                  <div className="w-full bg-surface-200 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-primary"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
                <p className="text-xs text-surface-500 mt-2">
                  Extracting text, detecting graphs, and identifying key points...
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

