import { NextResponse } from "next/server";

/**
 * Next.js 16+ prefers `proxy.ts` over the legacy `middleware.ts` convention.
 *
 * This is intentionally a no-op proxy for now: it allows all requests through.
 * Add auth redirects / header rewrites here later as needed.
 */
export default function proxy() {
  return NextResponse.next();
}

// Match all routes except Next internals/static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};