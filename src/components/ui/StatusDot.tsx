"use client";

import { cn } from "../../lib/utils";

interface StatusDotProps {
  color?: "green" | "yellow" | "red" | "gray";
  label?: string;
  className?: string;
}

const COLOR_MAP = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-500",
};

export function StatusDot({
  color = "gray",
  label,
  className,
}: StatusDotProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_MAP[color])} />
      {label && <span className="text-xs text-slate-300">{label}</span>}
    </div>
  );
}