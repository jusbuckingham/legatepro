// src/components/ui/Tag.tsx

import * as React from "react";

import { cn } from "@/lib/utils";

export type TagVariant = "default" | "muted" | "outline";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
}

const baseClasses =
  "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-none transition-colors";

const variantClasses: Record<TagVariant, string> = {
  default:
    "border-slate-800 bg-slate-950/70 text-slate-100",
  muted:
    "border-slate-800 bg-slate-900/60 text-slate-300",
  outline:
    "border-slate-700 bg-transparent text-slate-200",
};

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(baseClasses, variantClasses[variant], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Tag.displayName = "Tag";

export default Tag;