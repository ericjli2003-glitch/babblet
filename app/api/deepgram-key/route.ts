import { NextResponse } from 'next/server';

// This endpoint provides the Deepgram API key to the client for WebSocket connection
// In production, you might want to generate temporary tokens instead

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  
  if (!apiKey) {
    console.log('[Deepgram Key] API key not configured');
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 500 }
    );
  }

  // Return the API key for WebSocket authentication
  // Note: In production, consider using Deepgram's temporary key generation
  return NextResponse.json({ key: apiKey });
}

