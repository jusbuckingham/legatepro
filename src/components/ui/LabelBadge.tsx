"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelBadgeVariant =
  | "default"
  | "subtle"
  | "outline"
  | "alert"
  | "success";

export type LabelBadgeSize = "sm" | "md";

export interface LabelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: LabelBadgeVariant;
  size?: LabelBadgeSize;
}

/**
 * LabelBadge
 * Lightweight inline badge for status / metadata labeling.
 * Purely presentational (non-interactive).
 */
export const LabelBadge = React.forwardRef<
  HTMLSpanElement,
  LabelBadgeProps
>(function LabelBadge(
  {
    variant = "default",
    size = "sm",
    className,
    children,
    ...props
  },
  ref
) {
  const base =
    "inline-flex items-center whitespace-nowrap rounded-full border font-medium leading-tight";

  const sizeClass =
    size === "md"
      ? "px-2.5 py-0.5 text-xs"
      : "px-2 py-0.5 text-[11px]";

  const variantClass =
    variant === "alert"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : variant === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
      : variant === "outline"
      ? "border-border bg-background text-foreground"
      : variant === "subtle"
      ? "border-transparent bg-muted text-muted-foreground"
      : "border-primary/20 bg-primary/10 text-primary";

  return (
    <span
      ref={ref}
      className={cn(base, sizeClass, variantClass, className)}
      {...props}
    >
      {children}
    </span>
  );
});

LabelBadge.displayName = "LabelBadge";

export default LabelBadge;