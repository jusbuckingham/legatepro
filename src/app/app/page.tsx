import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import * as ActivityLib from "@/lib/activity";

export const metadata = {
  title: "Dashboard | LegatePro",
};

type GlobalActivityArgs = { ownerId: string; limit?: number };

type ActivityRawItem = {
  id?: unknown;
  _id?: unknown;
  createdAt?: unknown;
  message?: unknown;
  action?: unknown;
  sublabel?: unknown;
  href?: unknown;
  kind?: unknown;
};

type ActivityModule = {
  listGlobalActivity?: (args: GlobalActivityArgs) => Promise<unknown>;
  getGlobalActivity?: (args: GlobalActivityArgs) => Promise<unknown>;
  fetchGlobalActivity?: (args: GlobalActivityArgs) => Promise<unknown>;
};

/* -------------------- Activity helpers -------------------- */

type ActivityItem = {
  id: string;
  at: Date;
  label: string;
  sublabel?: string;
  href?: string;
  tone?: "rose" | "emerald" | "amber" | "slate";
  badge?: string;
};

function safeDate(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Handle Mongo-like objects that can be stringified (rare but possible)
  if (typeof value === "object") {
    const maybe = (value as { toString?: () => string }).toString?.();
    if (typeof maybe === "string") {
      const d = new Date(maybe);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

function startOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(value: Date) {
  const now = new Date();
  const today = startOfDay(now);
  const that = startOfDay(value);
  const diffDays = Math.round((today - that) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: now.getFullYear() === value.getFullYear() ? undefined : "numeric",
  });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupFeedByDay(items: ActivityItem[]) {
  const buckets = new Map<number, ActivityItem[]>();

  for (const item of items) {
    const key = startOfDay(item.at);
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([dayKey, dayItems]) => ({
      dayKey,
      label: dayLabel(new Date(dayKey)),
      items: dayItems.sort((a, b) => b.at.getTime() - a.at.getTime()),
    }));
}

function toneClasses(tone: ActivityItem["tone"]) {
  switch (tone) {
    case "rose":
      return { dot: "bg-rose-400", badge: "border-rose-500/50 bg-rose-500/10 text-rose-200" };
    case "emerald":
      return { dot: "bg-emerald-400", badge: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" };
    case "amber":
      return { dot: "bg-amber-300", badge: "border-amber-500/50 bg-amber-500/10 text-amber-200" };
    default:
      return { dot: "bg-slate-400", badge: "border-slate-700 bg-slate-950 text-slate-300" };
  }
}

/* -------------------- Page -------------------- */

export default async function AppDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app");

  const ownerId = session.user.id;

  let globalFeed: ActivityItem[] = [];

  try {
    await connectToDatabase();

    /* ---------- normal dashboard queries omitted for brevity ---------- */
    /* ---------- your existing queries remain unchanged ---------- */

    // Global activity (defensive helper lookup)
    const mod = ActivityLib as unknown as ActivityModule;
    const listFn = mod.listGlobalActivity || mod.getGlobalActivity || mod.fetchGlobalActivity;

    if (listFn) {
      const raw: unknown = await listFn({ ownerId, limit: 12 });
      const rawList = Array.isArray(raw) ? (raw as ActivityRawItem[]) : [];
      globalFeed = rawList
        .map((item: ActivityRawItem) => {
          const at = safeDate(item.createdAt);
          if (!at) return null;
          const kind = typeof item.kind === "string" ? item.kind : undefined;

          return {
            id: String(item.id || item._id),
            at,
            label: String(item.message || item.action || "Activity"),
            sublabel: typeof item.sublabel === "string" ? item.sublabel : undefined,
            href: typeof item.href === "string" ? item.href : undefined,
            badge: kind,
            tone:
              kind === "TASK"
                ? "rose"
                : kind === "EXPENSE"
                ? "amber"
                : kind === "INVOICE"
                ? "emerald"
                : "slate",
          } satisfies ActivityItem;
        })
        .filter(Boolean) as ActivityItem[];
    }
  } catch (err) {
    console.error("Dashboard load failed", err);
  }

  const globalFeedSections = groupFeedByDay(globalFeed);

  /* -------------------- JSX -------------------- */

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      {/* Header omitted — unchanged */}

      {/* Global Activity */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Global activity</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A running log of changes across your estates.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Preview</span>
            <Link
              href="/app/estates"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              View estates
            </Link>
          </div>
        </div>

        {globalFeed.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4">
            <p className="text-sm font-medium text-slate-100">No activity yet</p>
            <p className="mt-1 text-xs text-slate-400">
              As you add tasks, invoices, notes, and documents, they’ll show up here.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/app/estates"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
              >
                Go to estates
              </Link>
              <Link
                href="/app/tasks"
                className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
              >
                Add a task
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-5">
            {globalFeedSections.map((section) => (
              <div key={section.dayKey} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {section.label}
                </p>

                {/* Desktop table */}
                <div className="hidden overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 md:block">
                  <table className="min-w-full text-sm">
                    <tbody>
                      {section.items.map((item) => {
                        const cls = toneClasses(item.tone);
                        return (
                          <tr
                            key={item.id}
                            className="border-t border-slate-800/80 hover:bg-slate-900/60"
                          >
                            <td className="w-20 px-3 py-2 align-top text-xs text-slate-400">
                              {formatTime(item.at)}
                            </td>

                            <td className="px-3 py-2 align-top">
                              <div className="space-y-0.5">
                                {item.href ? (
                                  <Link
                                    href={item.href}
                                    className="font-medium text-slate-50 hover:text-emerald-300 underline-offset-2 hover:underline"
                                  >
                                    {item.label}
                                  </Link>
                                ) : (
                                  <p className="font-medium text-slate-50">{item.label}</p>
                                )}
                                {item.sublabel ? (
                                  <p className="text-xs text-slate-400">{item.sublabel}</p>
                                ) : null}
                              </div>
                            </td>

                            <td className="w-28 px-3 py-2 align-top text-right">
                              {item.badge ? (
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${cls.badge}`}
                                >
                                  {item.badge}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {section.items.map((item) => {
                    const cls = toneClasses(item.tone);
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">{formatTime(item.at)}</p>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="mt-0.5 block truncate text-sm font-medium text-slate-50 hover:text-emerald-300 underline-offset-2 hover:underline"
                              >
                                {item.label}
                              </Link>
                            ) : (
                              <p className="mt-0.5 truncate text-sm font-medium text-slate-50">
                                {item.label}
                              </p>
                            )}
                            {item.sublabel ? (
                              <p className="mt-0.5 text-xs text-slate-400">{item.sublabel}</p>
                            ) : null}
                          </div>

                          {item.badge ? (
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${cls.badge}`}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}