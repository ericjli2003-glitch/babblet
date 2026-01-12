// ============================================
// Text Extraction from Various File Formats
// Supports: PDF, DOCX, PPTX, TXT, MD
// ============================================

import mammoth from 'mammoth';
import { extractText as extractPdfText, extractImages, getDocumentProxy } from 'unpdf';
import { OfficeParser } from 'officeparser';
import OpenAI from 'openai';
import sharp from 'sharp';

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

export type SupportedFileType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'audio' | 'video' | 'unknown';

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

// Audio/video extensions for transcription
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'wmv'];

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
  if (ext && AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (ext && VIDEO_EXTENSIONS.includes(ext)) return 'video';
  
  // Fall back to mime type
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'docx';
    if (mimeType.includes('presentationml') || mimeType === 'application/vnd.ms-powerpoint') return 'pptx';
    if (mimeType.startsWith('text/')) return 'txt';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
  }
  
  return 'unknown';
}

export function isAudioVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ext ? [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(ext) : false;
}

// ============================================
// PDF Extraction (with OCR fallback for scanned documents)
// ============================================

// Minimum words expected per page - if below this, likely a scanned/image PDF
const MIN_WORDS_PER_PAGE = 20;

async function extractFromPDFWithOCR(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Check if OpenAI is configured for Vision OCR
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('[TextExtraction] OpenAI not configured, trying officeparser OCR...');
      // Fallback to officeparser (may not work in serverless)
      try {
        const ast = await OfficeParser.parseOffice(buffer, { ocr: true, ocrLanguage: 'eng' });
        const text = ast.toText();
        if (text && text.trim().length > 10) {
          return {
            success: true,
            text,
            wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
            fileType: 'pdf',
            usedOcr: true,
          };
        }
      } catch {
        // officeparser OCR failed, continue to return error
      }
      return {
        success: false,
        text: '',
        error: 'OCR requires OPENAI_API_KEY for Vision-based text extraction',
        fileType: 'pdf',
      };
    }

    console.log('[TextExtraction] Attempting Vision OCR extraction for scanned PDF...');
    
    // Extract images from all PDF pages using unpdf
    const uint8Array = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(uint8Array);
    const numPages = pdf.numPages;
    
    // Collect all images from all pages
    const allImages: Array<{ data: Uint8ClampedArray; width: number; height: number; channels: 1 | 3 | 4 }> = [];
    
    for (let pageNum = 1; pageNum <= Math.min(numPages, 10); pageNum++) { // Limit to first 10 pages
      try {
        const pageImages = await extractImages(pdf, pageNum);
        allImages.push(...pageImages);
      } catch {
        // Some pages may not have images
      }
    }
    
    if (allImages.length === 0) {
      console.log('[TextExtraction] No images found in PDF for OCR');
      return {
        success: false,
        text: '',
        error: 'No extractable images found in PDF. The PDF may use a format that cannot be processed.',
        fileType: 'pdf',
      };
    }

    console.log(`[TextExtraction] Found ${allImages.length} images across ${numPages} pages, sending to GPT-4 Vision...`);

    // Use OpenAI Vision to extract text from images
    const openai = new OpenAI({ apiKey });
    const extractedTexts: string[] = [];

    // Process images one at a time (they can be large)
    const maxImages = Math.min(allImages.length, 10); // Limit to first 10 images
    
    for (let i = 0; i < maxImages; i++) {
      const img = allImages[i];
      
      try {
        // Convert raw pixel data to PNG using sharp
        // Channels: 1 = grayscale, 3 = RGB, 4 = RGBA
        const pngBuffer = await sharp(Buffer.from(img.data), {
          raw: {
            width: img.width,
            height: img.height,
            channels: img.channels,
          },
        })
          .png()
          .toBuffer();
        
        const base64 = pngBuffer.toString('base64');
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract ALL text from this image. Include all visible text, maintaining the reading order. Output ONLY the extracted text, no commentary or descriptions.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64}`,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 4000,
        });

        const text = response.choices[0]?.message?.content || '';
        if (text.trim() && !text.toLowerCase().includes('cannot') && !text.toLowerCase().includes('unable') && !text.toLowerCase().includes('no text')) {
          extractedTexts.push(text.trim());
        }
      } catch (visionError) {
        console.error('[TextExtraction] Vision API error for image:', visionError);
      }
    }

    const combinedText = extractedTexts.join('\n\n');
    
    if (!combinedText || combinedText.length < 10) {
      return {
        success: false,
        text: '',
        error: 'Vision OCR could not extract readable text from PDF images',
        fileType: 'pdf',
      };
    }

    console.log(`[TextExtraction] Vision OCR extracted ${combinedText.split(/\s+/).length} words from ${allImages.length} images`);

    return {
      success: true,
      text: combinedText,
      wordCount: combinedText.split(/\s+/).filter((w: string) => w.length > 0).length,
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
// Audio/Video Transcription using Deepgram
// ============================================

async function transcribeAudioVideo(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  const fileType = detectFileType(filename);
  
  try {
    // Check if Deepgram is configured
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        text: '',
        error: 'Deepgram API not configured. Set DEEPGRAM_API_KEY environment variable.',
        fileType: fileType as SupportedFileType,
      };
    }

    console.log(`[TextExtraction] Transcribing ${fileType} file: ${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Dynamic import to avoid loading Deepgram when not needed
    const { createClient } = await import('@deepgram/sdk');
    const deepgram = createClient(apiKey);

    // Deepgram can handle audio/video files directly
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        diarize: true, // Speaker detection for lectures
        utterances: true, // Get utterance-level timestamps
      }
    );

    if (error) {
      console.error('[TextExtraction] Deepgram transcription error:', error);
      return {
        success: false,
        text: '',
        error: `Transcription failed: ${error.message}`,
        fileType: fileType as SupportedFileType,
      };
    }

    // Extract full transcript
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const text = transcript.trim();

    if (!text) {
      return {
        success: false,
        text: '',
        error: 'No speech detected in the audio/video file',
        fileType: fileType as SupportedFileType,
      };
    }

    // Get duration from metadata if available
    const duration = result?.metadata?.duration;
    const durationStr = duration ? ` (${Math.round(duration / 60)} minutes)` : '';
    
    console.log(`[TextExtraction] Transcription complete: ${text.split(/\s+/).length} words${durationStr}`);

    return {
      success: true,
      text,
      wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
      fileType: fileType as SupportedFileType,
    };
  } catch (error) {
    console.error('[TextExtraction] Transcription error:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Transcription failed',
      fileType: fileType as SupportedFileType,
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
    case 'audio':
    case 'video':
      return transcribeAudioVideo(buffer, filename);
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

export const SUPPORTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md',
  // Audio files
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma',
  // Video files
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv',
];

export function isSupportedFile(filename: string): boolean {
  const ext = '.' + filename.toLowerCase().split('.').pop();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

