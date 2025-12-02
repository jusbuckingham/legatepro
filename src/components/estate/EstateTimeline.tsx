"use client";

import Link from "next/link";
import { format } from "date-fns";

export type TimelineItem = {
  id: string;
  kind: "ESTATE_CREATED" | "INVOICE" | "EVENT";
  label: string;
  description?: string;
  timestamp: Date;
  href?: string;
};

type EstateTimelineProps = {
  items: TimelineItem[];
};

export function EstateTimeline({ items }: EstateTimelineProps) {
  const hasItems = items && items.length > 0;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Timeline</h2>
        <p className="text-[11px] text-slate-500">
          Recent activity on this estate.
        </p>
      </div>

      {!hasItems ? (
        <p className="text-xs text-slate-500">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-3 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-sky-400" />
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-100">
                      {item.label}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    {format(item.timestamp, "MMM d, yyyy")}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] text-slate-400">
                    {item.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}