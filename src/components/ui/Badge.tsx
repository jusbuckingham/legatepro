// src/components/ui/Badge.tsx
import * as React from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Visual variants for status, emphasis, and feedback badges */
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
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80",
  secondary:
    "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
  outline:
    "border-slate-300 text-slate-700 hover:bg-slate-100/60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60",
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
  const ariaLive: React.AriaAttributes["aria-live"] =
    variant === "success" || variant === "destructive" ? "polite" : undefined;
  return (
    <span
      className={cx(baseClasses, variantClasses[variant], className)}
      aria-live={ariaLive}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;