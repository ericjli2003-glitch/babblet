import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    const correctPassword = (process.env.APP_PASSWORD ?? '').trim();

    if (!correctPassword) {
      console.error('APP_PASSWORD env var is not set');
      return NextResponse.json({ success: false }, { status: 503 });
    }

    if (password && password === correctPassword) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('babblet_auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return response;
    }

    return NextResponse.json({ success: false }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
