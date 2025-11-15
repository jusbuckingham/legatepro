"use client";

import * as React from "react";
import { cn } from "../../../../lib/utils";

export type LabelBadgeVariant = "default" | "subtle" | "outline" | "alert" | "success";

export interface LabelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: LabelBadgeVariant;
  children: React.ReactNode;
}

export function LabelBadge({
  variant = "default",
  children,
  className,
  ...rest
}: LabelBadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight";

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
    <span className={cn(base, variantClass, className)} {...rest}>
      {children}
    </span>
  );
}