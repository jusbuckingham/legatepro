import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16+ prefers `proxy.ts` over the legacy `middleware.ts` convention.
 *
 * This is intentionally a no-op proxy for now: it allows all requests through.
 * Add auth redirects / header rewrites here later as needed.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never run proxy logic for NextAuth routes or any API route.
  // This avoids interfering with `/api/auth/*` (credentials callbacks, CSRF, providers, etc.)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Match all routes except Next internals/static assets and API routes.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};