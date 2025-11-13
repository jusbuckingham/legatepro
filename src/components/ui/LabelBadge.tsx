"use client";

import { cn } from "@/lib/utils";

interface LabelBadgeProps {
  status:
    | "open"
    | "pending"
    | "closed"
    | "needs-info"
    | "warning"
    | "active"
    | "inactive";
  className?: string;
}

const STATUS_STYLES = {
  open: "bg-emerald-600/20 border-emerald-600 text-emerald-300",
  pending: "bg-amber-600/20 border-amber-600 text-amber-300",
  closed: "bg-slate-700/40 border-slate-600 text-slate-300",
  "needs-info": "bg-red-600/20 border-red-600 text-red-300",
  warning: "bg-amber-600/20 border-amber-600 text-amber-300",
  active: "bg-emerald-600/20 border-emerald-600 text-emerald-300",
  inactive: "bg-slate-800/40 border-slate-700 text-slate-400",
};

export function LabelBadge({ status, className }: LabelBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {status.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}