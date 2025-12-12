import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, createSession, addTranscriptSegment, broadcastToSession } from '@/lib/session-store';
import { isOpenAIConfigured } from '@/lib/openai-questions';
import { broadcastTranscript } from '@/lib/pusher';
import type { TranscriptSegment } from '@/lib/types';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import OpenAI from 'openai';

// Get ffmpeg path - works on Vercel with ffmpeg-static
let ffmpegPath: string;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = 'ffmpeg'; // Fallback to system ffmpeg
}

// Get extension from mimetype
function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('m4a')) return '.m4a';
  if (mimeType.includes('flac')) return '.flac';
  return '.webm'; // Default
}

// Convert audio to WAV using ffmpeg
async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Converting ${inputPath} -> ${outputPath}`);
    console.log(`[FFmpeg] Using ffmpeg at: ${ffmpegPath}`);
    
    const args = [
      '-i', inputPath,
      '-vn',                    // No video
      '-acodec', 'pcm_s16le',   // PCM 16-bit little-endian
      '-ar', '16000',           // 16kHz sample rate (optimal for speech)
      '-ac', '1',               // Mono
      '-y',                     // Overwrite output
      outputPath
    ];
    
    const ffmpeg = spawn(ffmpegPath, args);
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('error', (err) => {
      console.error(`[FFmpeg] Spawn error:`, err);
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`[FFmpeg] Conversion successful`);
        resolve();
      } else {
        console.error(`[FFmpeg] Conversion failed with code ${code}`);
        console.error(`[FFmpeg] stderr: ${stderr}`);
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

// Initialize OpenAI client lazily
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function POST(request: NextRequest) {
  let inputPath: string | null = null;
  let outputPath: string | null = null;
  
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

    // Create temp file paths in /tmp (Vercel-safe)
    const tempDir = os.tmpdir();
    const fileId = `audio_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inputExt = getExtensionFromMime(originalMimeType);
    inputPath = path.join(tempDir, `${fileId}_input${inputExt}`);
    outputPath = path.join(tempDir, `${fileId}_output.wav`);

    console.log(`[Transcribe] Input path: ${inputPath}`);
    console.log(`[Transcribe] Output path: ${outputPath}`);

    // Write input audio to temp file
    fs.writeFileSync(inputPath, buffer);
    console.log(`[Transcribe] Wrote ${buffer.length} bytes to input file`);

    // Convert to WAV using ffmpeg
    await convertToWav(inputPath, outputPath);

    // Verify output exists and has content
    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg conversion failed - output file not created');
    }
    
    const outputStats = fs.statSync(outputPath);
    console.log(`[Transcribe] Converted WAV size: ${outputStats.size} bytes`);

    if (outputStats.size < 1000) {
      console.log('[Transcribe] Converted file too small, likely no audio content');
      return NextResponse.json({
        success: true,
        message: 'No audio content detected'
      });
    }

    // Send to OpenAI Whisper
    console.log(`[Transcribe] Sending WAV to Whisper API...`);
    
    const client = getOpenAI();
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(outputPath),
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
    // Clean up temp files
    const filesToClean = [inputPath, outputPath];
    for (const filePath of filesToClean) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[Transcribe] Cleaned up: ${filePath}`);
        } catch (e) {
          console.warn(`[Transcribe] Failed to clean up ${filePath}:`, e);
        }
      }
    }
  }
}
