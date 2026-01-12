// ============================================
// Text Extraction from Various File Formats
// Supports: PDF, DOCX, PPTX, TXT, MD
// ============================================

import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';
import { OfficeParser } from 'officeparser';

// Serverless-compatible PDF parsing using unpdf
async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  try {
    // Convert Buffer to Uint8Array for unpdf
    const uint8Array = new Uint8Array(buffer);
    
    // Use unpdf which is designed for serverless environments
    const result = await extractPdfText(uint8Array, { mergePages: true });
    
    // With mergePages: true, text is a string; otherwise it's string[]
    const textContent = result.text;
    const finalText = Array.isArray(textContent) ? textContent.join('\n') : textContent;
    
    return { 
      text: finalText, 
      numpages: result.totalPages 
    };
  } catch (error) {
    console.error('unpdf extraction failed:', error);
    throw error;
  }
}

export type SupportedFileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'unknown';

export interface ExtractionResult {
  success: boolean;
  text: string;
  pageCount?: number;
  wordCount?: number;
  error?: string;
  fileType: SupportedFileType;
  usedOcr?: boolean; // True if OCR was used for extraction
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
  if (ext === 'pptx') return 'pptx';
  if (ext === 'ppt') return 'pptx'; // Try officeparser for .ppt too
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  
  // Fall back to mime type
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'docx';
    if (mimeType.includes('presentationml') || mimeType === 'application/vnd.ms-powerpoint') return 'pptx';
    if (mimeType.startsWith('text/')) return 'txt';
  }
  
  return 'unknown';
}

// ============================================
// PDF Extraction (with OCR fallback for scanned documents)
// ============================================

// Minimum words expected per page - if below this, likely a scanned/image PDF
const MIN_WORDS_PER_PAGE = 20;

async function extractFromPDFWithOCR(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Use officeparser with OCR enabled for scanned PDFs
    console.log('[TextExtraction] Attempting OCR extraction for scanned PDF...');
    const ast = await OfficeParser.parseOffice(buffer, { 
      ocr: true,
      // OCR language - English by default, can add more like 'eng+fra+deu'
      ocrLanguage: 'eng',
    });
    const text = ast.toText();
    
    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
      fileType: 'pdf',
      usedOcr: true,
    };
  } catch (error) {
    console.error('[TextExtraction] OCR extraction failed:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'OCR extraction failed',
      fileType: 'pdf',
    };
  }
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // First, try regular text extraction (faster)
    const data = await parsePDF(buffer);
    const wordCount = data.text.split(/\s+/).filter(w => w.length > 0).length;
    const wordsPerPage = data.numpages > 0 ? wordCount / data.numpages : wordCount;
    
    // If we got enough text, use it
    if (wordsPerPage >= MIN_WORDS_PER_PAGE || wordCount >= 50) {
      console.log(`[TextExtraction] Regular PDF extraction: ${wordCount} words from ${data.numpages} pages`);
      return {
        success: true,
        text: data.text,
        pageCount: data.numpages,
        wordCount,
        fileType: 'pdf',
      };
    }
    
    // Low text content - likely a scanned document, try OCR
    console.log(`[TextExtraction] Low text content (${wordCount} words, ${wordsPerPage.toFixed(1)}/page), trying OCR...`);
    const ocrResult = await extractFromPDFWithOCR(buffer);
    
    // If OCR got more text, use it; otherwise use what we have
    if (ocrResult.success && ocrResult.wordCount && ocrResult.wordCount > wordCount) {
      console.log(`[TextExtraction] OCR improved extraction: ${ocrResult.wordCount} words (was ${wordCount})`);
      return {
        ...ocrResult,
        pageCount: data.numpages,
      };
    }
    
    // OCR didn't help, return original (might just be a short document)
    return {
      success: true,
      text: data.text,
      pageCount: data.numpages,
      wordCount,
      fileType: 'pdf',
    };
  } catch (error) {
    // Regular extraction failed, try OCR as last resort
    console.log('[TextExtraction] Regular PDF extraction failed, attempting OCR...');
    const ocrResult = await extractFromPDFWithOCR(buffer);
    if (ocrResult.success) {
      return ocrResult;
    }
    
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
// PPTX Extraction
// ============================================

async function extractFromPPTX(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const ast = await OfficeParser.parseOffice(buffer);
    const text = ast.toText();
    
    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
      fileType: 'pptx',
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'PPTX extraction failed',
      fileType: 'pptx',
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
    case 'pptx':
      return extractFromPPTX(buffer);
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

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md'];

export function isSupportedFile(filename: string): boolean {
  const ext = '.' + filename.toLowerCase().split('.').pop();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

