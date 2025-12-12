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
    // Use gemini-1.5-pro-latest for stable audio transcription support
    const model = client.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

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
    // Use gemini-1.5-flash-latest for fast semantic analysis
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
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

