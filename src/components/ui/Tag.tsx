// src/components/ui/Tag.tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export type TagVariant = "default" | "muted" | "outline";

export interface TagProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: TagVariant;
}

const baseClasses =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors";

const variantClasses: Record<TagVariant, string> = {
  default:
    "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
  muted:
    "border-transparent bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400",
  outline:
    "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-100",
};

export function Tag({
  className,
  variant = "default",
  children,
  ...props
}: TagProps) {
  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export default Tag;