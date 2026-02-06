import { NextRequest, NextResponse } from 'next/server';

// Routes that are always public (no auth required)
const PUBLIC_PATHS = [
  '/',
  '/about',
  '/contact',
  '/login',
  '/api/auth',
  '/api/contact',
  '/icon.svg',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?|ttf)$/.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('babblet_auth')?.value;
  if (authCookie === 'authenticated') {
    return NextResponse.next();
  }

  // Redirect to login with return URL
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
