"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type StatusDotColor = "green" | "yellow" | "red" | "gray";
export type StatusDotSize = "sm" | "md";

export interface StatusDotProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual dot color */
  color?: StatusDotColor;
  /** Dot size */
  size?: StatusDotSize;
  /** Optional visible label text shown to the right of the dot */
  label?: string;
  /** Optional accessible name when `label` is not provided */
  srLabel?: string;
}

const COLOR_MAP: Record<StatusDotColor, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-500",
};

const SIZE_MAP: Record<StatusDotSize, string> = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
};

export const StatusDot = React.forwardRef<HTMLDivElement, StatusDotProps>(
  (
    {
      color = "gray",
      size = "md",
      label,
      srLabel,
      className,
      ...props
    },
    ref
  ) => {
    const accessibleName = label ?? srLabel;

    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center gap-2", className)}
        {...props}
      >
        <span
          aria-hidden={accessibleName ? true : undefined}
          className={cn(
            "shrink-0 rounded-full",
            SIZE_MAP[size],
            COLOR_MAP[color]
          )}
        />

        {label ? (
          <span className="text-xs text-slate-300">{label}</span>
        ) : srLabel ? (
          <span className="sr-only">{srLabel}</span>
        ) : null}
      </div>
    );
  }
);

StatusDot.displayName = "StatusDot";