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
