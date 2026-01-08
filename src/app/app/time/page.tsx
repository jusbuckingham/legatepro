import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import PageSection from "@/components/layout/PageSection";
import { redirect } from "next/navigation";
import { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { TimeEntry } from "@/models/TimeEntry";

/**
 * Lean types for our queries
 */

interface EstateDocLean {
  id: string;
  _id?: string | Types.ObjectId;
  caseName?: string;
  courtCaseNumber?: string;
  decedentName?: string;
  status?: string;
}

interface TimeEntryDocLean {
  id: string;
  _id?: string | Types.ObjectId;
  ownerId?: string | Types.ObjectId;
  estateId?: string | Types.ObjectId;
  taskId?: string | Types.ObjectId | null;
  date: Date | string;
  minutes: number;
  rate?: number | null;
  amount?: number | null;
  notes?: string | null;
  description?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

interface PageProps {
  searchParams?: SearchParamsInput;
}

/**
 * Helpers
 */

function toIdString(id: unknown): string | undefined {
  if (!id) return undefined;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  if (typeof id === "object" && id !== null) {
    const maybe = id as { toString?: () => string };
    if (typeof maybe.toString === "function") return maybe.toString();
  }
  return undefined;
}

function toObjectId(id: string) {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRawId(doc: unknown): unknown {
  return isRecord(doc) ? doc._id : undefined;
}

function toDateOrString(value: unknown): Date | string {
  if (value instanceof Date) return value;
  if (typeof value === "string") return value;
  return new Date(0);
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return toNumber(value);
}

function toOptionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : String(value);
}

function parseDateInput(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function getEstateDisplayName(estate: EstateDocLean): string {
  if (estate.caseName) return estate.caseName;
  if (estate.decedentName) return estate.decedentName;
  if (estate.courtCaseNumber) return `Case ${estate.courtCaseNumber}`;
  return "Unnamed Estate";
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function computeAmount(entry: TimeEntryDocLean): number {
  const minutes = Number(entry.minutes ?? 0);

  if (entry.amount !== undefined && entry.amount !== null) {
    return Number(entry.amount);
  }

  if (entry.rate !== undefined && entry.rate !== null) {
    return Number(entry.rate) * (minutes / 60);
  }

  return 0;
}

export default async function GlobalTimePage({ searchParams }: PageProps) {
  // Handle Next 16 "searchParams can be a Promise" behavior
  const resolvedSearchParams =
    (await Promise.resolve(searchParams ?? {})) ?? {};

  const estateFilter =
    typeof resolvedSearchParams.estateId === "string" &&
    resolvedSearchParams.estateId.length > 0
      ? resolvedSearchParams.estateId
      : undefined;

  const fromInput =
    typeof resolvedSearchParams.from === "string"
      ? resolvedSearchParams.from
      : undefined;
  const toInput =
    typeof resolvedSearchParams.to === "string"
      ? resolvedSearchParams.to
      : undefined;

  const sortKey =
    typeof resolvedSearchParams.sort === "string"
      ? resolvedSearchParams.sort
      : "date-desc";

  const fromDate = parseDateInput(fromInput);
  const toDate = parseDateInput(toInput);

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await connectToDatabase();

  const ownerObjectId = toObjectId(session.user.id);
  const ownerIdOr: Array<Record<string, unknown>> = [
    { ownerId: session.user.id },
    ...(ownerObjectId ? [{ ownerId: ownerObjectId }] : []),
  ];

  // Load all estates for this user (for filter + display)
  const estateDocs = await Estate.find({
    $or: [...ownerIdOr, { "collaborators.userId": session.user.id }],
  })
    .select("_id caseName courtCaseNumber decedentName status")
    .lean()
    .exec();

  const estates: EstateDocLean[] = (estateDocs ?? []).map((d) => {
    const base = serializeMongoDoc(d);
    const obj = isRecord(base) ? base : {};

    const rawId = getRawId(d);
    const id =
      typeof obj.id === "string" && obj.id.length > 0
        ? obj.id
        : toIdString(rawId) ?? "";

    return {
      id,
      _id: rawId as string | Types.ObjectId | undefined,
      caseName: typeof obj.caseName === "string" ? obj.caseName : undefined,
      courtCaseNumber:
        typeof obj.courtCaseNumber === "string" ? obj.courtCaseNumber : undefined,
      decedentName:
        typeof obj.decedentName === "string" ? obj.decedentName : undefined,
      status: typeof obj.status === "string" ? obj.status : undefined,
    };
  });

  const estateById = new Map<string, EstateDocLean>();
  for (const est of estates) {
    const idStr = est.id || toIdString(est._id);
    if (idStr) estateById.set(idStr, est);
  }

  // Load all time entries, then filter/sort in memory for now
  const timeDocs = await TimeEntry.find({ $or: ownerIdOr })
    .sort({ date: -1, createdAt: -1 })
    .lean()
    .exec();

  const allEntries: TimeEntryDocLean[] = (timeDocs ?? []).map((d) => {
    const base = serializeMongoDoc(d);
    const obj = isRecord(base) ? base : {};

    const rawId = getRawId(d);
    const id =
      typeof obj.id === "string" && obj.id.length > 0
        ? obj.id
        : toIdString(rawId) ?? "";

    const ownerId = toIdString(obj.ownerId);
    const estateId = toIdString(obj.estateId);
    const taskIdRaw = obj.taskId;

    const taskId =
      taskIdRaw === null
        ? null
        : taskIdRaw === undefined
          ? undefined
          : (toIdString(taskIdRaw) ?? undefined);

    return {
      id,
      _id: rawId as string | Types.ObjectId | undefined,
      ownerId,
      estateId,
      taskId,
      date: toDateOrString(obj.date),
      minutes: toNumber(obj.minutes, 0),
      rate: toOptionalNumber(obj.rate) ?? null,
      amount: toOptionalNumber(obj.amount) ?? null,
      notes: toOptionalString(obj.notes) ?? null,
      description: toOptionalString(obj.description) ?? null,
      createdAt:
        obj.createdAt instanceof Date || typeof obj.createdAt === "string"
          ? obj.createdAt
          : undefined,
      updatedAt:
        obj.updatedAt instanceof Date || typeof obj.updatedAt === "string"
          ? obj.updatedAt
          : undefined,
    };
  });

  // Apply filters
  let entries = allEntries.slice();

  if (estateFilter) {
    entries = entries.filter((entry) => {
      const estateIdStr = toIdString(entry.estateId);
      return estateIdStr === estateFilter;
    });
  }

  if (fromDate) {
    entries = entries.filter((entry) => {
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) return false;
      return d >= fromDate;
    });
  }

  if (toDate) {
    entries = entries.filter((entry) => {
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) return false;
      // inclusive end date
      return d <= toDate;
    });
  }

  // Sorting
  const sortedEntries = entries.slice().sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    const aHours = (a.minutes ?? 0) / 60;
    const bHours = (b.minutes ?? 0) / 60;
    const aAmount = computeAmount(a);
    const bAmount = computeAmount(b);

    switch (sortKey) {
      case "date-asc":
        return aDate - bDate;
      case "hours-desc":
        return bHours - aHours;
      case "hours-asc":
        return aHours - bHours;
      case "amount-desc":
        return bAmount - aAmount;
      case "amount-asc":
        return aAmount - bAmount;
      case "date-desc":
      default:
        return bDate - aDate;
    }
  });

  // Analytics based on filtered set
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let totalMinutes = 0;
  let totalAmount = 0;
  let monthMinutes = 0;
  let monthAmount = 0;

  const minutesByEstate = new Map<string, number>();
  const amountByEstate = new Map<string, number>();

  for (const entry of entries) {
    const minutes = Number(entry.minutes ?? 0);
    const amount = computeAmount(entry);

    totalMinutes += minutes;
    totalAmount += amount;

    const d = new Date(entry.date);
    if (!Number.isNaN(d.getTime())) {
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        monthMinutes += minutes;
        monthAmount += amount;
      }
    }

    const estateIdStr = toIdString(entry.estateId) ?? "unassigned";
    minutesByEstate.set(
      estateIdStr,
      (minutesByEstate.get(estateIdStr) ?? 0) + minutes,
    );
    amountByEstate.set(
      estateIdStr,
      (amountByEstate.get(estateIdStr) ?? 0) + amount,
    );
  }

  const totalHours = totalMinutes / 60;
  const monthHours = monthMinutes / 60;

  const topEstateEntries = Array.from(minutesByEstate.entries())
    .sort(([, aMinutes], [, bMinutes]) => bMinutes - aMinutes)
    .slice(0, 3)
    .map(([estateIdStr, mins]) => {
      const estate = estateById.get(estateIdStr);
      return {
        estateId: estateIdStr,
        label: estate ? getEstateDisplayName(estate) : "Unassigned",
        hours: mins / 60,
        amount: amountByEstate.get(estateIdStr) ?? 0,
      };
    });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
      <PageHeader
        eyebrow="Global"
        title="Time"
        description="Track and analyze time spent across all estates."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/estates"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800"
            >
              View Estates
            </Link>
          </div>
        }
      />

      <PageSection title="Filters" description="Narrow results by estate, date range, and sort order.">
        <form
          method="GET"
          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-4">
            {/* Estate select */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Estate
              </label>
              <select
                name="estateId"
                defaultValue={estateFilter ?? ""}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              >
                <option value="">All estates</option>
                {estates.map((estate) => {
                  const idStr = estate.id || toIdString(estate._id) || "";
                  return (
                    <option key={idStr} value={idStr}>
                      {getEstateDisplayName(estate)}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* From date */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                From
              </label>
              <input
                type="date"
                name="from"
                defaultValue={fromInput ?? ""}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </div>

            {/* To date */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                To
              </label>
              <input
                type="date"
                name="to"
                defaultValue={toInput ?? ""}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              />
            </div>

            {/* Sort */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Sort By
              </label>
              <select
                name="sort"
                defaultValue={sortKey}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
              >
                <option value="date-desc">Date (newest first)</option>
                <option value="date-asc">Date (oldest first)</option>
                <option value="hours-desc">Hours (high to low)</option>
                <option value="hours-asc">Hours (low to high)</option>
                <option value="amount-desc">Amount (high to low)</option>
                <option value="amount-asc">Amount (low to high)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-500"
            >
              Apply
            </button>
            <Link
              href="/app/time"
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-500 hover:bg-slate-800"
            >
              Reset
            </Link>
          </div>
        </form>
      </PageSection>

      <PageSection title="Summary" description="High-level totals based on the current filters.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Total Hours (Filtered)
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-50">
              {totalHours.toFixed(2)}h
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Across {entries.length} time entries.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              This Month (Filtered)
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-50">
              {monthHours.toFixed(2)}h · {formatCurrency(monthAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Hours + value logged this calendar month.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Total Value (Filtered)
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-50">
              {formatCurrency(totalAmount)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Based on time entries and hourly rates.
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="Top Estates" description="The estates with the most time logged in the filtered set.">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          {topEstateEntries.length === 0 ? (
            <p className="text-xs text-slate-500">
              No time entries match the current filters.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {topEstateEntries.map((item) => (
                <li
                  key={item.estateId}
                  className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-slate-100">{item.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.hours.toFixed(2)}h · {formatCurrency(item.amount)}
                    </p>
                  </div>
                  {item.estateId !== "unassigned" && (
                    <Link
                      href={`/app/estates/${item.estateId}/time`}
                      className="text-[11px] font-medium text-rose-300 hover:text-rose-200"
                    >
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageSection>

      <PageSection
        title="Time Entries"
        description={`Showing ${sortedEntries.length} entries matching filters.`}
      >
        <div className="rounded-xl border border-slate-800 bg-slate-950/80">
          {sortedEntries.length === 0 ? (
            <div className="px-4 py-6 text-xs text-slate-500">
              No time entries found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-t border-slate-800 text-xs">
                <thead className="bg-slate-950/90 text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2 text-left">
                      Estate
                    </th>
                    <th scope="col" className="px-4 py-2 text-left">
                      Task
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      Hours
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-2 text-left">
                      Notes
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => {
                    const idStr = entry.id || toIdString(entry._id) || "";
                    const estateIdStr = toIdString(entry.estateId);
                    const estate =
                      (estateIdStr && estateById.get(estateIdStr)) || undefined;

                    const amount = computeAmount(entry);
                    const rawNotes = (entry.notes ?? entry.description ?? "").toString();
                    const noteText = rawNotes.trim();

                    return (
                      <tr
                        key={idStr}
                        className="border-t border-slate-800/70 hover:bg-slate-900/60"
                      >
                        <td className="px-4 py-2 align-top text-slate-200">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-4 py-2 align-top text-slate-200">
                          {estate ? (
                            <Link
                              href={`/app/estates/${estateIdStr}/time`}
                              className="hover:underline"
                            >
                              {getEstateDisplayName(estate)}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top text-slate-300">
                          {entry.taskId
                            ? `Task ${toIdString(entry.taskId)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 align-top text-right text-slate-100">
                          {((entry.minutes ?? 0) / 60).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 align-top text-right text-slate-100">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-4 py-2 align-top text-slate-300">
                          {noteText.length > 0 ? noteText : "—"}
                        </td>
                        <td className="px-4 py-2 align-top text-right">
                          {estateIdStr ? (
                            <Link
                              href={`/app/estates/${estateIdStr}/time/${idStr}`}
                              className="text-[11px] font-medium text-rose-300 hover:text-rose-200"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-[11px] text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageSection>
    </div>
  );
}