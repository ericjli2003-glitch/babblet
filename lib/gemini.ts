// ============================================
// Gemini API Integration
// Real-time audio understanding and semantic detection
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import type {
  SemanticEvent,
  SemanticEventType,
  TranscriptSegment,
} from './types';

// Local type for Gemini response
interface GeminiSemanticResponse {
  events: Array<{
    type: SemanticEventType;
    content: string;
    confidence: number;
  }>;
}

// Initialize Gemini client
let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// ============================================
// Audio Transcription with Gemini
// ============================================

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<TranscriptSegment | null> {
  try {
    console.log(`[Gemini] Transcribing audio: ${audioBuffer.length} bytes, input type: ${mimeType}`);

    const client = getGeminiClient();
    // Use gemini-2.5-flash for fast audio transcription
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Convert buffer to base64 - ensure no data: prefix
    let base64Audio = audioBuffer.toString('base64');
    // Strip any data URL prefix if present
    if (base64Audio.includes(',')) {
      base64Audio = base64Audio.split(',')[1];
    }
    console.log(`[Gemini] Base64 encoded: ${base64Audio.length} chars, first 50: ${base64Audio.slice(0, 50)}`);

    // Normalize MIME type - Gemini accepts these audio formats:
    // audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
    // Note: audio/webm may not be fully supported, try audio/ogg as fallback
    let audioMimeType = 'audio/ogg'; // Default to ogg which is well-supported
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      audioMimeType = 'audio/mp3';
    } else if (mimeType.includes('wav')) {
      audioMimeType = 'audio/wav';
    } else if (mimeType.includes('ogg')) {
      audioMimeType = 'audio/ogg';
    } else if (mimeType.includes('flac')) {
      audioMimeType = 'audio/flac';
    } else if (mimeType.includes('aac')) {
      audioMimeType = 'audio/aac';
    } else if (mimeType.includes('webm')) {
      // WebM containers usually have opus codec, try as ogg
      audioMimeType = 'audio/webm';
    }
    console.log(`[Gemini] Using MIME type: ${audioMimeType}`);

    // Build the request payload for debugging
    const requestPayload = [
      {
        inlineData: {
          mimeType: audioMimeType,
          data: base64Audio,
        },
      },
      {
        text: 'Transcribe this audio. Return only the spoken words, nothing else. If silent or unclear, return empty string.',
      },
    ];

    console.log(`[Gemini] Request payload structure: inlineData.mimeType=${audioMimeType}, inlineData.data.length=${base64Audio.length}, text prompt included`);

    // Use the simpler array format that the SDK handles well
    const result = await model.generateContent(requestPayload);

    const response = result.response;
    const text = response.text().trim();

    console.log(`[Gemini] Transcription result: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

    if (!text || text.length === 0) {
      console.log('[Gemini] No speech detected');
      return null;
    }

    return {
      id: uuidv4(),
      text,
      timestamp: Date.now(),
      duration: 0,
      isFinal: true,
    };
  } catch (error: unknown) {
    // Enhanced error logging
    console.error('[Gemini] Transcription error:', error);
    if (error && typeof error === 'object') {
      const err = error as { status?: number; statusText?: string; message?: string; errorDetails?: unknown };
      console.error('[Gemini] Error details:', {
        status: err.status,
        statusText: err.statusText,
        message: err.message,
        errorDetails: err.errorDetails,
      });
    }
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Semantic Event Detection
// ============================================

const SEMANTIC_DETECTION_PROMPT = `You are an expert at analyzing academic presentations. 
Analyze the following transcript segment and identify any semantic events present.

For each event, classify it as one of:
- "claim": A main argument or assertion being made
- "topic_shift": A change in the subject being discussed
- "definition": A term or concept being defined
- "example": An illustrative example or case study
- "argument": Supporting reasoning for a claim
- "evidence": Data, facts, or citations supporting arguments
- "conclusion": A summary or concluding statement
- "question": A rhetorical or actual question posed
- "unclear": Content that is ambiguous or poorly articulated

Respond ONLY with valid JSON in this exact format:
{
  "events": [
    {
      "type": "claim" | "topic_shift" | "definition" | "example" | "argument" | "evidence" | "conclusion" | "question" | "unclear",
      "content": "Brief description of the event",
      "confidence": 0.0-1.0
    }
  ]
}

If no significant semantic events are detected, return: {"events": []}`;

export async function detectSemanticEvents(
  transcript: string,
  context?: string
): Promise<SemanticEvent[]> {
  try {
    const client = getGeminiClient();
    // Use gemini-2.5-flash for fast semantic analysis
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = context
      ? `${SEMANTIC_DETECTION_PROMPT}\n\nPrevious context: ${context}\n\nCurrent transcript: ${transcript}`
      : `${SEMANTIC_DETECTION_PROMPT}\n\nTranscript: ${transcript}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const parsed: GeminiSemanticResponse = JSON.parse(text);

    if (!parsed.events || !Array.isArray(parsed.events)) {
      return [];
    }

    return parsed.events
      .filter(e => e.confidence >= 0.6) // Only keep high-confidence events
      .map(event => ({
        id: uuidv4(),
        type: event.type as SemanticEventType,
        content: event.content,
        confidence: event.confidence,
        timestamp: Date.now(),
        context: transcript.slice(0, 200),
      }));
  } catch (error) {
    console.error('Semantic detection error:', error);
    return [];
  }
}

// ============================================
// Combined Real-time Processing
// ============================================

export async function processAudioChunk(
  audioBuffer: Buffer,
  mimeType: string,
  previousTranscript: string = ''
): Promise<{
  transcript: TranscriptSegment | null;
  events: SemanticEvent[];
}> {
  // First, transcribe the audio
  const transcript = await transcribeAudio(audioBuffer, mimeType);

  if (!transcript || !transcript.text) {
    return { transcript: null, events: [] };
  }

  // Then detect semantic events
  const events = await detectSemanticEvents(
    transcript.text,
    previousTranscript.slice(-500) // Last 500 chars for context
  );

  return { transcript, events };
}

// ============================================
// Streaming Support (for future WebSocket impl)
// ============================================

export async function* streamTranscription(
  audioStream: AsyncIterable<Buffer>,
  mimeType: string = 'audio/webm'
): AsyncGenerator<TranscriptSegment> {
  for await (const chunk of audioStream) {
    const segment = await transcribeAudio(chunk, mimeType);
    if (segment) {
      yield segment;
    }
  }
}

// ============================================
// Video/Presentation Analysis
// Extract and analyze visual content from videos
// ============================================

export interface SlideContent {
  slideNumber: number;
  timestamp: number; // ms from start
  title?: string;
  textContent: string;
  keyPoints: string[];
  visualElements?: string[];
  dataOrCharts?: string[];
}

export interface VideoAnalysisResult {
  slides: SlideContent[];
  presentationType: 'screen_share' | 'webcam_only' | 'mixed';
  summary: string;
}

/**
 * Analyze video for presentation content using Gemini's native video understanding
 * Works with Zoom recordings, screen shares, etc.
 */
export async function analyzeVideoForSlides(
  videoUrl: string,
  mimeType: string = 'video/mp4'
): Promise<VideoAnalysisResult> {
  try {
    console.log(`[Gemini] Analyzing video for slide content: ${videoUrl.slice(0, 100)}...`);
    
    const client = getGeminiClient();
    // Gemini 2.5 Flash supports video understanding
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        fileData: {
          mimeType,
          fileUri: videoUrl,
        },
      },
      {
        text: `Analyze this presentation video. Extract information about any slides or screen share content shown.

For each distinct slide or screen shown, provide:
1. Approximate timestamp (in seconds from start)
2. Slide title if visible
3. All text content on the slide
4. Key points or bullet points
5. Description of any charts, graphs, or visual elements
6. Any data or statistics shown

Also determine:
- Is this a screen share presentation, webcam only, or mixed?
- Provide a brief summary of the overall presentation content

Respond ONLY with valid JSON in this format:
{
  "presentationType": "screen_share" | "webcam_only" | "mixed",
  "summary": "Brief summary of presentation content",
  "slides": [
    {
      "slideNumber": 1,
      "timestamp": 0,
      "title": "Slide title if visible",
      "textContent": "All text visible on this slide",
      "keyPoints": ["Point 1", "Point 2"],
      "visualElements": ["Description of charts/images"],
      "dataOrCharts": ["Any statistics or data shown"]
    }
  ]
}

If no slides/screen share content is detected, return empty slides array.`,
      },
    ]);

    const response = result.response;
    const text = response.text();
    
    console.log(`[Gemini] Video analysis response length: ${text.length}`);

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Convert timestamps from seconds to milliseconds
      const slides: SlideContent[] = (parsed.slides || []).map((s: {
        slideNumber: number;
        timestamp: number;
        title?: string;
        textContent: string;
        keyPoints: string[];
        visualElements?: string[];
        dataOrCharts?: string[];
      }, i: number) => ({
        slideNumber: s.slideNumber || i + 1,
        timestamp: (s.timestamp || 0) * 1000,
        title: s.title,
        textContent: s.textContent || '',
        keyPoints: s.keyPoints || [],
        visualElements: s.visualElements,
        dataOrCharts: s.dataOrCharts,
      }));

      console.log(`[Gemini] Extracted ${slides.length} slides, type: ${parsed.presentationType}`);

      return {
        slides,
        presentationType: parsed.presentationType || 'mixed',
        summary: parsed.summary || '',
      };
    }

    return {
      slides: [],
      presentationType: 'webcam_only',
      summary: 'Could not extract slide content from video',
    };
  } catch (error) {
    console.error('[Gemini] Video analysis error:', error);
    return {
      slides: [],
      presentationType: 'webcam_only',
      summary: 'Video analysis failed',
    };
  }
}

/**
 * Correlate extracted slides with transcript segments
 * Returns enriched transcript with slide context
 */
export function correlateSlidesWithTranscript(
  slides: SlideContent[],
  transcriptSegments: Array<{ id: string; text: string; timestamp: number }>
): Array<{ id: string; text: string; timestamp: number; slideContext?: SlideContent }> {
  if (slides.length === 0) {
    return transcriptSegments;
  }

  // Sort slides by timestamp
  const sortedSlides = [...slides].sort((a, b) => a.timestamp - b.timestamp);

  return transcriptSegments.map(segment => {
    // Find the slide that was showing at this transcript timestamp
    let currentSlide: SlideContent | undefined;
    
    for (const slide of sortedSlides) {
      if (slide.timestamp <= segment.timestamp) {
        currentSlide = slide;
      } else {
        break;
      }
    }

    return {
      ...segment,
      slideContext: currentSlide,
    };
  });
}

/**
 * Build a presentation context string for AI prompts
 */
export function buildPresentationContext(slides: SlideContent[]): string {
  if (slides.length === 0) return '';

  const parts = ['PRESENTATION SLIDES CONTENT:'];
  
  for (const slide of slides) {
    parts.push(`\n[Slide ${slide.slideNumber}${slide.title ? `: ${slide.title}` : ''}]`);
    if (slide.textContent) {
      parts.push(`Text: ${slide.textContent}`);
    }
    if (slide.keyPoints.length > 0) {
      parts.push(`Key Points: ${slide.keyPoints.join('; ')}`);
    }
    if (slide.visualElements && slide.visualElements.length > 0) {
      parts.push(`Visuals: ${slide.visualElements.join('; ')}`);
    }
    if (slide.dataOrCharts && slide.dataOrCharts.length > 0) {
      parts.push(`Data: ${slide.dataOrCharts.join('; ')}`);
    }
  }

  return parts.join('\n');
}

