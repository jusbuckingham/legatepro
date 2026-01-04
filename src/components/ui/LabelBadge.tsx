"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

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

export const LabelBadge = React.forwardRef<
  HTMLSpanElement,
  LabelBadgeProps
>(function LabelBadge(
  {
    variant = "default",
    size = "sm",
    className,
    children,
    ...rest
  },
  ref
) {
  const base =
    "inline-flex items-center rounded-full font-medium leading-tight whitespace-nowrap";

  const sizeClass =
    size === "md"
      ? "px-2.5 py-0.5 text-xs"
      : "px-2 py-0.5 text-[11px]";

  const variantClass =
    variant === "alert"
      ? "bg-destructive/10 text-destructive border border-destructive/30"
      : variant === "success"
      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
      : variant === "outline"
      ? "border border-border text-foreground bg-background"
      : variant === "subtle"
      ? "bg-muted text-muted-foreground"
      : "bg-primary/10 text-primary border border-primary/20";

  return (
    <span
      ref={ref}
      className={cn(base, sizeClass, variantClass, className)}
      {...rest}
    >
      {children}
    </span>
  );
});

LabelBadge.displayName = "LabelBadge";

export default LabelBadge;