import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, createSession, addTranscriptSegment, broadcastToSession } from '@/lib/session-store';
import { isOpenAIConfigured } from '@/lib/openai-questions';
import { broadcastTranscript } from '@/lib/pusher';
import type { TranscriptSegment } from '@/lib/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import OpenAI from 'openai';

// Initialize OpenAI client lazily
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Get extension from mimetype - use formats Whisper definitely supports
function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('flac')) return 'flac';
  // WebM - use as-is, Whisper claims to support it
  if (mimeType.includes('webm')) return 'webm';
  return 'webm'; // Default
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob | null;
    const sessionId = formData.get('sessionId') as string | null;
    const timestamp = formData.get('timestamp') as string | null;

    if (!audioBlob || !sessionId) {
      return NextResponse.json(
        { error: 'Audio blob and session ID required' },
        { status: 400 }
      );
    }

    // On serverless, sessions may not persist across function invocations
    let session = getSession(sessionId);
    if (!session) {
      console.log(`[Transcribe] Session ${sessionId} not found, creating temporary session`);
      session = createSession();
    }

    // Check if OpenAI is configured
    if (!isOpenAIConfigured()) {
      console.log('[Transcribe] OPENAI_API_KEY not found in environment');
      const mockSegment: TranscriptSegment = {
        id: uuidv4(),
        text: '[OpenAI API not configured] Add OPENAI_API_KEY to Vercel environment variables and redeploy.',
        timestamp: parseInt(timestamp || '0', 10),
        duration: 0,
        isFinal: true,
      };

      addTranscriptSegment(sessionId, mockSegment);
      broadcastToSession(sessionId, {
        type: 'transcript_update',
        data: { segment: mockSegment },
        timestamp: Date.now(),
        sessionId,
      });

      return NextResponse.json({
        success: false,
        error: 'OpenAI API not configured',
        segment: mockSegment,
      });
    }

    // Log original audio info
    const originalMimeType = audioBlob.type || 'audio/webm';
    console.log(`[Transcribe] Received audio: ${audioBlob.size} bytes, mimeType: ${originalMimeType}`);

    // Check minimum size
    if (audioBlob.size < 5000) {
      console.log(`[Transcribe] Audio too small (${audioBlob.size} bytes), skipping`);
      return NextResponse.json({
        success: true,
        message: 'Audio chunk too small, skipping'
      });
    }

    // Convert blob to buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create temp file in /tmp (Vercel-safe)
    const tempDir = os.tmpdir();
    const fileId = `audio_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const extension = getExtensionFromMime(originalMimeType);
    tempFilePath = path.join(tempDir, `${fileId}.${extension}`);

    console.log(`[Transcribe] Writing to temp file: ${tempFilePath}`);

    // Write buffer to temp file
    fs.writeFileSync(tempFilePath, buffer);
    
    const stats = fs.statSync(tempFilePath);
    console.log(`[Transcribe] Temp file size: ${stats.size} bytes`);

    // Send to OpenAI Whisper using file stream
    console.log(`[Transcribe] Sending to Whisper API...`);
    
    const client = getOpenAI();
    
    // Use createReadStream which Whisper API accepts
    const fileStream = fs.createReadStream(tempFilePath);
    
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fileStream,
      language: 'en',
      response_format: 'text',
    });

    const text = typeof transcription === 'string' ? transcription.trim() : '';
    
    console.log(`[Transcribe] Whisper result: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

    if (!text || text.length === 0) {
      console.log('[Transcribe] No speech detected');
      return NextResponse.json({
        success: true,
        message: 'No speech detected',
      });
    }

    // Create transcript segment
    const segment: TranscriptSegment = {
      id: uuidv4(),
      text,
      timestamp: parseInt(timestamp || '0', 10),
      duration: 0,
      isFinal: true,
    };

    addTranscriptSegment(sessionId, segment);

    // Broadcast to connected clients
    broadcastToSession(sessionId, {
      type: 'transcript_update',
      data: { segment },
      timestamp: Date.now(),
      sessionId,
    });

    // Broadcast via Pusher for real-time multi-user support
    await broadcastTranscript(sessionId, segment);

    return NextResponse.json({
      success: true,
      segment,
    });

  } catch (error) {
    console.error('[Transcribe] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[Transcribe] Cleaned up: ${tempFilePath}`);
      } catch (e) {
        console.warn(`[Transcribe] Failed to clean up ${tempFilePath}:`, e);
      }
    }
  }
}
