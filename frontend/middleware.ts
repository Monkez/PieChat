import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'development' && request.nextUrl.pathname === '/@vite/client') {
    return new NextResponse('', {
      status: 200,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/@vite/client'],
};
