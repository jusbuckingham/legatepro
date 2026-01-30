"use client";

import * as React from "react";

/**
 * Lightweight utility for conditionally joining class names.
 * Keeps UI primitives dependency-free.
 */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Visual style variant.
   * - default: standard input surface
   * - subtle: slightly softer border/background
   */
  variant?: "default" | "subtle";
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", variant = "default", disabled, ...props }, ref) => {
    const base = "flex h-9 w-full rounded-md border px-3 py-2 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60";

    const themeDefault =
      "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus-visible:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

    const themeSubtle =
      "border-slate-800 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 focus-visible:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

    const theme = variant === "subtle" ? themeSubtle : themeDefault;

    return (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        aria-disabled={disabled}
        className={cx(base, theme, className)}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;