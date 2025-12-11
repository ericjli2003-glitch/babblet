import { NextResponse } from 'next/server';
import { isPusherConfigured } from '@/lib/pusher';

export async function GET() {
  return NextResponse.json({
    configured: isPusherConfigured(),
    key: process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY || '',
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || process.env.PUSHER_CLUSTER || '',
  });
}

