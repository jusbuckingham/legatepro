export type LabelBadgeStatus =
  | "open"
  | "pending"
  | "closed"
  | "needs-info"
  | "warning"
  | "active"
  | "inactive";

export interface LabelBadgeProps {
  status: LabelBadgeStatus;
  className?: string;
}

/**
 * Small pill-style badge used to show high-level estate status.
 * Colors are intentionally subtle to fit the LegatePro dark UI.
 */
export function LabelBadge({ status, className }: LabelBadgeProps) {
  const label = (() => {
    switch (status) {
      case "open":
        return "Open";
      case "pending":
        return "Pending";
      case "closed":
        return "Closed";
      case "needs-info":
        return "Needs info";
      case "warning":
        return "Attention";
      case "active":
        return "Active";
      case "inactive":
        return "Inactive";
      default:
        return status;
    }
  })();

  const colorClasses = (() => {
    switch (status) {
      case "open":
      case "active":
        return "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
      case "pending":
      case "needs-info":
        return "border-amber-400/50 bg-amber-500/10 text-amber-200";
      case "warning":
        return "border-red-500/60 bg-red-500/10 text-red-200";
      case "closed":
      case "inactive":
        return "border-slate-600/60 bg-slate-900 text-slate-300";
      default:
        return "border-slate-700 bg-slate-900 text-slate-300";
    }
  })();

  const baseClasses =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide";
  const merged = className ? `${baseClasses} ${colorClasses} ${className}` : `${baseClasses} ${colorClasses}`;

  return <span className={merged}>{label}</span>;
}