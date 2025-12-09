import { type ClassValue, clsx } from 'clsx';

// Note: If you want to use tailwind-merge, install it: npm install clsx tailwind-merge
// Then import { twMerge } from 'tailwind-merge' and use: twMerge(clsx(inputs))
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Format milliseconds to MM:SS
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Format milliseconds to HH:MM:SS
export function formatTimeLong(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Truncate text with ellipsis
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Generate a random ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Debounce function
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Calculate word count
export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

// Estimate reading time (in minutes)
export function readingTime(text: string, wordsPerMinute = 200): number {
  const words = wordCount(text);
  return Math.ceil(words / wordsPerMinute);
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Check if we're on the client side
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

// Check if browser supports MediaRecorder
export function supportsMediaRecorder(): boolean {
  return isClient() && 'MediaRecorder' in window;
}

// Check if browser supports getUserMedia
export function supportsGetUserMedia(): boolean {
  return isClient() && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
}

// Get supported audio MIME type
export function getSupportedAudioMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  return 'audio/webm'; // fallback
}

// Color utilities for difficulty badges
export function getDifficultyColor(difficulty: 'easy' | 'medium' | 'hard'): {
  bg: string;
  text: string;
} {
  const colors = {
    easy: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
    hard: { bg: 'bg-rose-100', text: 'text-rose-700' },
  };
  return colors[difficulty];
}

// Score to color mapping
export function getScoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600';
  if (score >= 3) return 'text-amber-600';
  if (score >= 2) return 'text-orange-600';
  return 'text-red-600';
}

// Percentage to gradient position
export function percentageToGradient(percentage: number): string {
  return `${Math.min(100, Math.max(0, percentage))}%`;
}

