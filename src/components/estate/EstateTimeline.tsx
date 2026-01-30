"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useMemo } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type TimelineItem = {
  id: string;
  kind: "ESTATE_CREATED" | "INVOICE" | "EVENT";
  label: string;
  description?: string;
  timestamp: Date | string;
  href?: string;
};

type EstateTimelineProps = {
  items: TimelineItem[];
};

export function EstateTimeline({ items }: EstateTimelineProps) {
  const normalizedItems = useMemo(() => {
    const list = Array.isArray(items) ? items : [];

    return [...list]
      .map((it) => {
        const ts = it.timestamp instanceof Date
          ? it.timestamp
          : new Date(String(it.timestamp));
        return {
          ...it,
          timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [items]);

  const hasItems = normalizedItems.length > 0;

  const kindLabel: Record<TimelineItem["kind"], string> = {
    ESTATE_CREATED: "Estate",
    INVOICE: "Invoice",
    EVENT: "Event",
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
      aria-label="Estate timeline"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Timeline</h2>
        <p className="text-[11px] text-slate-500">
          Recent activity on this estate.
        </p>
      </div>

      {!hasItems ? (
        <div
          role="status"
          className="rounded-md border border-slate-800 bg-slate-950/40 p-3"
        >
          <p className="text-xs font-medium text-slate-200">No activity yet</p>
          <p className="mt-1 text-[11px] text-slate-500">
            When you add invoices, time entries, documents, or collaborators, you’ll see it show up here.
          </p>
        </div>
      ) : (
        <ol className="space-y-3 text-sm">
          {normalizedItems.map((item, index) => {
            const dateLabel = format(item.timestamp, "MMM d, yyyy");

            return (
              <li
                key={item.id}
                className="flex gap-3"
                aria-current={index === 0 ? "true" : undefined}
              >
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-sky-400" />

                <div
                  className="min-w-0 space-y-0.5"
                  aria-describedby={
                    item.description ? `timeline-desc-${item.id}` : undefined
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      id={`timeline-kind-${item.id}`}
                      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200"
                    >
                      {kindLabel[item.kind]}
                    </span>

                    {item.href ? (
                      <Link
                        href={item.href}
                        className={cx(
                          "truncate font-medium text-sky-400 hover:text-sky-300",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                        )}
                        title={item.label}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-slate-100" title={item.label}>
                        {item.label}
                      </span>
                    )}

                    <time
                      dateTime={item.timestamp.toISOString()}
                      className="text-[11px] text-slate-500"
                    >
                      {dateLabel}
                    </time>
                  </div>

                  {item.description ? (
                    <p
                      id={`timeline-desc-${item.id}`}
                      className="text-[11px] text-slate-400"
                    >
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}