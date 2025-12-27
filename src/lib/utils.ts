import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility helpers for classNames and formatting.
 * - `cn` merges Tailwind and conditional class names (shadcn-style).
 * - `formatCurrency` formats numbers as USD currency.
 * - `formatDate` formats dates as locale date strings.
 */

export function formatCurrency(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatDate(
  value: Date | string | number | null | undefined,
): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US");
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safe JSON parsing for `fetch` responses.
 *
 * Why: `await res.json()` can throw (empty body, non-JSON, etc). This helper keeps
 * callers from sprinkling `catch(() => ...)` everywhere.
 */
export async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    // Some APIs return empty bodies on errors; guard the common case.
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of an error message from an API response.
 */
export async function getApiErrorMessage(res: Response): Promise<string> {
  const data = await safeJson<unknown>(res);
  if (data && typeof data === "object") {
    const maybe =
      (data as { error?: unknown; message?: unknown }).error ??
      (data as { message?: unknown }).message;

    if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  }
  return res.statusText || "Request failed";
}
