// ============================================
// Text Extraction from Various File Formats
// Supports: PDF, DOCX, TXT, MD
// ============================================

import mammoth from 'mammoth';

// pdf-parse uses CommonJS exports, need to handle dynamically
async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  // Dynamic import to handle CommonJS module
  const pdfParse = await import('pdf-parse').then(m => m.default || m);
  return pdfParse(buffer);
}

export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'md' | 'unknown';

export interface ExtractionResult {
  success: boolean;
  text: string;
  pageCount?: number;
  wordCount?: number;
  error?: string;
  fileType: SupportedFileType;
}

// ============================================
// File Type Detection
// ============================================

export function detectFileType(filename: string, mimeType?: string): SupportedFileType {
  const ext = filename.toLowerCase().split('.').pop();
  
  // Check by extension first
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'docx'; // Try mammoth for .doc too
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  
  // Fall back to mime type
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'docx';
    if (mimeType.startsWith('text/')) return 'txt';
  }
  
  return 'unknown';
}

// ============================================
// PDF Extraction
// ============================================

async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const data = await parsePDF(buffer);
    
    return {
      success: true,
      text: data.text,
      pageCount: data.numpages,
      wordCount: data.text.split(/\s+/).filter(w => w.length > 0).length,
      fileType: 'pdf',
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'PDF extraction failed',
      fileType: 'pdf',
    };
  }
}

// ============================================
// DOCX Extraction
// ============================================

async function extractFromDOCX(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      fileType: 'docx',
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'DOCX extraction failed',
      fileType: 'docx',
    };
  }
}

// ============================================
// Plain Text Extraction
// ============================================

function extractFromText(buffer: Buffer): ExtractionResult {
  try {
    const text = buffer.toString('utf-8');
    
    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      fileType: 'txt',
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Text extraction failed',
      fileType: 'txt',
    };
  }
}

// ============================================
// Main Extraction Function
// ============================================

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ExtractionResult> {
  const fileType = detectFileType(filename, mimeType);
  
  switch (fileType) {
    case 'pdf':
      return extractFromPDF(buffer);
    case 'docx':
      return extractFromDOCX(buffer);
    case 'txt':
    case 'md':
      return extractFromText(buffer);
    default:
      return {
        success: false,
        text: '',
        error: `Unsupported file type: ${filename}`,
        fileType: 'unknown',
      };
  }
}

// ============================================
// Extract from URL (for R2 files)
// ============================================

export async function extractTextFromUrl(
  url: string,
  filename: string,
  mimeType?: string
): Promise<ExtractionResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        text: '',
        error: `Failed to fetch file: ${response.status}`,
        fileType: detectFileType(filename, mimeType),
      };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return extractText(buffer, filename, mimeType);
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Failed to fetch and extract',
      fileType: detectFileType(filename, mimeType),
    };
  }
}

// ============================================
// Get Supported Extensions
// ============================================

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md'];

export function isSupportedFile(filename: string): boolean {
  const ext = '.' + filename.toLowerCase().split('.').pop();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

