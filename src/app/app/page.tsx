import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import * as ActivityLib from "@/lib/activity";

export const metadata = {
  title: "Dashboard | LegatePro",
};

export const dynamic = "force-dynamic";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasCountDocuments(
  value: unknown,
): value is { countDocuments: (q: unknown) => Promise<number> } {
  return isRecord(value) && typeof (value as { countDocuments?: unknown }).countDocuments === "function";
}

/* -------------------- Activity helpers -------------------- */

type ActivityKind = "TASK" | "EXPENSE" | "INVOICE" | "DOCUMENT" | "NOTE" | "ESTATE";

type ActivityItem = {
  id: string;
  at: Date;
  label: string;
  sublabel?: string;
  href?: string;
  kind?: ActivityKind;
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

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeKind(value: unknown): ActivityKind | undefined {
  if (typeof value !== "string") return undefined;
  const k = value.toUpperCase();
  if (
    k === "TASK" ||
    k === "EXPENSE" ||
    k === "INVOICE" ||
    k === "DOCUMENT" ||
    k === "NOTE" ||
    k === "ESTATE"
  ) {
    return k;
  }
  return undefined;
}

function kindLabel(kind: ActivityKind | undefined): string | undefined {
  switch (kind) {
    case "TASK":
      return "Task";
    case "EXPENSE":
      return "Expense";
    case "INVOICE":
      return "Invoice";
    case "DOCUMENT":
      return "Document";
    case "NOTE":
      return "Note";
    case "ESTATE":
      return "Estate";
    default:
      return undefined;
  }
}

function kindTone(kind: ActivityKind | undefined): ActivityItem["tone"] {
  switch (kind) {
    case "TASK":
      return "rose";
    case "EXPENSE":
      return "amber";
    case "INVOICE":
      return "emerald";
    default:
      return "slate";
  }
}

function resolveActivityHref(raw: ActivityRawItem, kind: ActivityKind | undefined): string | undefined {
  // Prefer explicit internal hrefs.
  if (typeof raw.href === "string") {
    const h = raw.href.trim();
    if (h.startsWith("/")) return h;
  }

  // Fallback destinations by kind.
  switch (kind) {
    case "TASK":
      return "/app/tasks";
    case "INVOICE":
      return "/app/invoices";
    case "EXPENSE":
      return "/app/expenses";
    case "DOCUMENT":
      return "/app/documents";
    case "NOTE":
      return "/app/notes";
    case "ESTATE":
      return "/app/estates";
    default:
      return undefined;
  }
}

type FeedSectionLabel = "Today" | "This Week" | "Earlier";

function sectionEmptyCopy(label: FeedSectionLabel): {
  title: string;
  body: string;
  ctas: Array<{ href: string; label: string; tone: "slate" | "rose" | "emerald" }>;
} {
  switch (label) {
    case "Today":
      return {
        title: "Nothing yet today",
        body: "When you add or update items, they’ll show up here in real time.",
        ctas: [
          { href: "/app/tasks", label: "Add a task", tone: "rose" },
          { href: "/app/invoices", label: "Create an invoice", tone: "emerald" },
        ],
      };
    case "This Week":
      return {
        title: "Quiet week so far",
        body: "New activity across your estates will collect here automatically.",
        ctas: [
          { href: "/app/estates", label: "View estates", tone: "slate" },
          { href: "/app/tasks", label: "Review tasks", tone: "rose" },
        ],
      };
    default:
      return {
        title: "No older activity",
        body: "As your history builds, older actions will roll into this section.",
        ctas: [{ href: "/app/estates", label: "Go to estates", tone: "slate" }],
      };
  }
}

function startOfWeekMonday(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);

  // JS: 0=Sun..6=Sat. We want Monday as start.
  const day = d.getDay();
  const diff = (day + 6) % 7; // Mon->0 ... Sun->6
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

type FeedSection = {
  key: FeedSectionLabel;
  label: FeedSectionLabel;
  items: ActivityItem[];
};

function groupFeedBySmartRange(items: ActivityItem[]): FeedSection[] {
  const now = new Date();
  const todayKey = startOfDay(now);
  const weekKey = startOfWeekMonday(now);

  const today: ActivityItem[] = [];
  const thisWeek: ActivityItem[] = [];
  const earlier: ActivityItem[] = [];

  for (const item of items) {
    const itemDay = startOfDay(item.at);

    if (itemDay >= todayKey) {
      today.push(item);
    } else if (itemDay >= weekKey) {
      thisWeek.push(item);
    } else {
      earlier.push(item);
    }
  }

  const sortDesc = (a: ActivityItem, b: ActivityItem) => b.at.getTime() - a.at.getTime();

  today.sort(sortDesc);
  thisWeek.sort(sortDesc);
  earlier.sort(sortDesc);

  return [
    { key: "Today", label: "Today", items: today },
    { key: "This Week", label: "This Week", items: thisWeek },
    { key: "Earlier", label: "Earlier", items: earlier },
  ];
}

function toneClasses(tone: ActivityItem["tone"]) {
  switch (tone) {
    case "rose":
      return { dot: "bg-rose-400", badge: "border-rose-500/50 bg-rose-500/10 text-rose-200" };
    case "emerald":
      return {
        dot: "bg-emerald-400",
        badge: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
      };
    case "amber":
      return { dot: "bg-amber-300", badge: "border-amber-500/50 bg-amber-500/10 text-amber-200" };
    default:
      return { dot: "bg-slate-400", badge: "border-slate-700 bg-slate-950 text-slate-300" };
  }
}

function ctaClasses(tone: "slate" | "rose" | "emerald") {
  if (tone === "rose") {
    return "inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20";
  }
  if (tone === "emerald") {
    return "inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20";
  }
  return "inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70";
}

function pillClasses(active: boolean) {
  return active
    ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200"
    : "rounded-full border border-slate-800 bg-slate-900/30 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-900/60";
}

/* -------------------- Page -------------------- */

type PageProps = {
  // Next 16+ exposes searchParams as a Promise in server components
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function dashboardGreeting(name?: string | null) {
  const base = "Dashboard";
  const safe = (name ?? "").trim();
  if (!safe) return base;
  const first = safe.split(/\s+/)[0];
  return `Welcome, ${first}`;
}

export default async function AppDashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app");

  const ownerId = session.user.id;

  // Onboarding gate: if the user has no estates yet, show a first-estate flow.
  let estateCount = 0;

  // Activity feed UI state (URL-driven)
  let activityKindFilter: ActivityKind | "" = "";
  let activityPage = 1;

  if (searchParams) {
    const sp = await searchParams;

    const kindRaw = sp.kind;
    const pageRaw = sp.activityPage;

    const kindStr =
      typeof kindRaw === "string"
        ? kindRaw.trim()
        : Array.isArray(kindRaw)
        ? (kindRaw[0] ?? "").trim()
        : "";

    activityKindFilter = normalizeKind(kindStr) ?? "";

    const pageStr =
      typeof pageRaw === "string" ? pageRaw : Array.isArray(pageRaw) ? pageRaw[0] : "";

    const parsed = Number.parseInt(pageStr || "1", 10);
    activityPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  const ACTIVITY_PAGE_SIZE = 12;
  const activityLimit = ACTIVITY_PAGE_SIZE * activityPage;

  let globalFeed: ActivityItem[] = [];

  try {
    await connectToDatabase();


    // Determine whether the user has any estates. Use a defensive model import so we don't
    // hard-crash if the model export shape changes.
    try {
      const estateMod: unknown = await import("@/models/Estate");

      let maybeModel: unknown = null;
      if (isRecord(estateMod)) {
        maybeModel = (estateMod as { default?: unknown }).default ?? (estateMod as { Estate?: unknown }).Estate;
      }

      if (hasCountDocuments(maybeModel)) {
        estateCount = await maybeModel.countDocuments({ ownerId });
      }
    } catch {
      // If the model isn't present yet, treat as 0 estates for onboarding.
      estateCount = 0;
    }

    /* ---------- normal dashboard queries omitted for brevity ---------- */
    /* ---------- your existing queries remain unchanged ---------- */

    // Global activity (defensive helper lookup)
    const mod: ActivityModule = ActivityLib;
    const listFn = mod.listGlobalActivity || mod.getGlobalActivity || mod.fetchGlobalActivity;

    if (listFn) {
      const raw: unknown = await listFn({ ownerId, limit: activityLimit });
      const rawList = Array.isArray(raw) ? (raw as ActivityRawItem[]) : [];
      globalFeed = rawList
        .map((item: ActivityRawItem) => {
          const at = safeDate(item.createdAt);
          if (!at) return null;
          const kind = normalizeKind(item.kind);

          return {
            id: String(item.id || item._id),
            at,
            label: String(item.message || item.action || "Activity"),
            sublabel: typeof item.sublabel === "string" ? item.sublabel : undefined,
            kind,
            href: resolveActivityHref(item, kind),
            badge: kindLabel(kind),
            tone: kindTone(kind),
          } satisfies ActivityItem;
        })
        .filter(Boolean) as ActivityItem[];

      if (activityKindFilter) {
        globalFeed = globalFeed.filter((it) => it.kind === activityKindFilter);
      }
    }
  } catch (err) {
    console.error("Dashboard load failed", err);
  }

  if (estateCount === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{dashboardGreeting(session.user.name)}</h1>
          <p className="text-sm text-slate-400">
            Set up your first estate, then manage tasks, invoices, expenses, notes, documents, and contacts in one place.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              Create your first estate
            </Link>
            <Link
              href="/app/estates"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70"
            >
              View estates
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-50">Getting started</h2>
              <p className="text-sm text-slate-400">
                Create your first estate — then track tasks, invoices, expenses, notes, documents, and contacts in one place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/app/estates/new"
                className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
              >
                Create your first estate
              </Link>
              <Link
                href="/app/estates"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70"
              >
                View estates
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step 1</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">Create an estate</p>
              <p className="mt-1 text-xs text-slate-400">Add a name and basic details so everything else has a home.</p>
              <div className="mt-3">
                <Link href="/app/estates/new" className={ctaClasses("emerald")}>
                  Create estate
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step 2</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">Add contacts</p>
              <p className="mt-1 text-xs text-slate-400">Attorneys, heirs, vendors, tenants — anyone involved.</p>
              <div className="mt-3">
                <Link href="/app/contacts" className={ctaClasses("slate")}>
                  View contacts
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step 3</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">Track work + money</p>
              <p className="mt-1 text-xs text-slate-400">Tasks, invoices, expenses, notes, and documents — all in one place.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/app/tasks" className={ctaClasses("rose")}>
                  Add a task
                </Link>
                <Link href="/app/invoices" className={ctaClasses("emerald")}>
                  Create invoice
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Global activity</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Your activity feed will appear here after you create an estate and start adding items.
              </p>
            </div>
            <Link
              href="/app/estates/new"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Create estate
            </Link>
          </div>

          <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4">
            <p className="text-sm font-medium text-slate-100">No activity yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Create an estate to begin. Then tasks, invoices, notes, and documents will automatically show up here.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const globalFeedSections = groupFeedBySmartRange(globalFeed);

  /* -------------------- JSX -------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{dashboardGreeting(session.user.name)}</h1>
          <p className="text-sm text-slate-400">Your work across estates, all in one view.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/tasks/new"
            className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
          >
            New task
          </Link>
          <Link
            href="/app/invoices/new"
            className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
          >
            New invoice
          </Link>
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70"
          >
            Estates
          </Link>
        </div>
      </header>

      {/* Global Activity */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Global activity</h2>
            <p className="mt-0.5 text-xs text-slate-500">A running log of changes across your estates.</p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
            <span className="text-xs text-slate-500">Filter</span>

            <Link
              href="/app?activityPage=1"
              className={pillClasses(!activityKindFilter)}
            >
              All
            </Link>

            {(["TASK", "INVOICE", "EXPENSE", "NOTE", "DOCUMENT"] as const).map((k) => (
              <Link
                key={k}
                href={`/app?kind=${encodeURIComponent(k)}&activityPage=1`}
                className={pillClasses(activityKindFilter === k)}
              >
                {kindLabel(k) ?? k}
              </Link>
            ))}

            <span className="mx-1 hidden h-4 w-px bg-slate-800 md:block" />

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
          <>
            <div className="mt-4 space-y-6">
              {globalFeedSections.map((section) => (
                <div key={section.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {section.label}
                    </p>
                    <span className="text-[11px] text-slate-500">{section.items.length || "—"}</span>
                  </div>

                  {section.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-4">
                      {(() => {
                        const copy = sectionEmptyCopy(section.label);
                        return (
                          <>
                            <p className="text-sm font-medium text-slate-100">{copy.title}</p>
                            <p className="mt-1 text-xs text-slate-400">{copy.body}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {copy.ctas.map((cta) => (
                                <Link
                                  key={cta.href}
                                  href={cta.href}
                                  className={ctaClasses(cta.tone)}
                                >
                                  {cta.label}
                                </Link>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
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
                                  <td className="w-24 px-3 py-2 align-top text-xs text-slate-400">
                                    <div className="flex items-center gap-2">
                                      <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                                      <span>{formatTime(item.at)}</span>
                                    </div>
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
                                  <p className="flex items-center gap-2 text-xs text-slate-400">
                                    <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                                    <span>{formatTime(item.at)}</span>
                                  </p>
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
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Load more row */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Showing {Math.min(globalFeed.length, activityLimit)} item(s)
                {activityKindFilter ? ` for ${kindLabel(activityKindFilter) ?? activityKindFilter}` : ""}.
              </p>

              <Link
                href={`/app?${
                  activityKindFilter ? `kind=${encodeURIComponent(activityKindFilter)}&` : ""
                }activityPage=${activityPage + 1}`}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
              >
                Load more
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}