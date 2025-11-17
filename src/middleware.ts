// middleware.ts
import { NextResponse } from "next/server";

export function middleware() {
  // For now, just let all requests pass through.
  // We'll reintroduce authentication-aware middleware later.
  return NextResponse.next();
}

export const config = {
  matcher: []
};