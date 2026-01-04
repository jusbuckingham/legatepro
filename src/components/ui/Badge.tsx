// src/components/ui/Badge.tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const baseClasses =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-slate-800";

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80",
  secondary:
    "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
  outline:
    "border-slate-200 text-slate-900 dark:border-slate-800 dark:text-slate-50",
  destructive:
    "border-transparent bg-red-500 text-red-50 hover:bg-red-500/80",
  success:
    "border-transparent bg-emerald-500 text-emerald-50 hover:bg-emerald-500/80",
};

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  const liveRegion =
    variant === "success" || variant === "destructive" ? "polite" : undefined;
  return (
    <span
      className={cn(baseClasses, variantClasses[variant], className)}
      aria-live={liveRegion}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;