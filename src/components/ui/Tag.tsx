"use client";

import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tagVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-slate-800 text-slate-200",
        subtle: "bg-slate-900/40 text-slate-400",
        red: "bg-red-600/20 text-red-300",
        green: "bg-emerald-600/20 text-emerald-300",
        yellow: "bg-amber-600/20 text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  children: ReactNode;
}

export function Tag({ className, variant, children, ...props }: TagProps) {
  return (
    <span className={cn(tagVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}