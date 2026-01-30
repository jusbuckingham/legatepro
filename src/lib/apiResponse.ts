import { NextResponse } from "next/server";

export type ApiOk<T> = {
  ok: true;
  data: T;
};

export type ApiErr = {
  ok: false;
  error: string;
  code?: string;
};

export type ApiResult<T> = ApiOk<T> | ApiErr;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  const payload: ApiOk<T> = { ok: true, data };
  return NextResponse.json(payload, {
    ...init,
    status: init?.status ?? 200,
  });
}

export function jsonErr(
  error: string,
  status = 400,
  code?: string,
  init?: ResponseInit,
): NextResponse {
  const payload: ApiErr = { ok: false, error, ...(code ? { code } : {}) };
  return NextResponse.json(payload, {
    ...init,
    status,
  });
}

export function jsonUnauthorized(message = "Unauthorized"): NextResponse {
  return jsonErr(message, 401, "UNAUTHORIZED");
}

export function jsonForbidden(message = "Forbidden"): NextResponse {
  return jsonErr(message, 403, "FORBIDDEN");
}

export function jsonNotFound(message = "Not found"): NextResponse {
  return jsonErr(message, 404, "NOT_FOUND");
}

export function noStoreHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    ...(extra ?? {}),
  };
}

export function safeErrorMessage(err: unknown, fallback = "Unexpected error"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;

  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }

  return fallback;
}

export function requireObjectIdLike(id: string | null | undefined): boolean {
  // Avoid importing mongoose into every route; this is a lightweight check.
  // Mongo ObjectId is 24 hex chars.
  if (!id) return false;
  return /^[a-fA-F0-9]{24}$/.test(id);
}
