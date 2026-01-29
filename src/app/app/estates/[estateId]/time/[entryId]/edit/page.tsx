import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { TimeEntry } from "@/models/TimeEntry";

type PageProps = {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Edit Time Entry | LegatePro",
};

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function getStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  return firstParam(sp?.[key]).trim();
}

export default async function EstateTimeEntryEditPage({ params, searchParams }: PageProps) {
  const { estateId, entryId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const savedFlag = getStringParam(sp, "saved") === "1";
  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";
  const errorCode = getStringParam(sp, "error");

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(
      `/app/estates/${estateId}/time/${entryId}/edit`,
    );
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  await connectToDatabase();

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  if (!canEdit) {
    redirect(`/app/estates/${estateId}/time/${entryId}?forbidden=1`);
  }

  const rawEntry = await TimeEntry.findOne({
    _id: entryId,
    estateId,
  })
    .lean()
    .exec();

  if (!rawEntry) {
    notFound();
  }

  const entryObj = serializeMongoDoc(rawEntry) as Record<string, unknown>;

  const entryIdStr = String(
    (entryObj.id as string | undefined) ??
      ((entryObj._id as { toString?: () => string } | string | undefined)?.toString?.() ??
        (entryObj._id as string | undefined) ??
        ""),
  );

  const entry = {
    id: entryIdStr,
    estateId: entryObj.estateId as string | undefined,
    description: entryObj.description as string | undefined,
    notes: entryObj.notes as string | undefined,
    startTime: entryObj.startTime as Date | string | undefined,
    durationMinutes: entryObj.durationMinutes as number | undefined,
    billable: entryObj.billable as boolean | undefined,
    rateCents: entryObj.rateCents as number | null | undefined,
  };

  const totalMinutes = typeof entry.durationMinutes === "number" ? entry.durationMinutes : 0;
  const initialHours = Math.floor(totalMinutes / 60);
  const initialMinutes = totalMinutes % 60;

  const startDate = (() => {
    if (!entry.startTime) return "";
    const d = new Date(entry.startTime);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  })();

  const rateDisplay =
    typeof entry.rateCents === "number"
      ? (entry.rateCents / 100).toFixed(2)
      : "";

  async function updateTimeEntry(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user?.id) {
      const callbackUrl = encodeURIComponent(
        `/app/estates/${estateId}/time/${entryId}/edit`,
      );
      redirect(`/login?callbackUrl=${callbackUrl}`);
    }

    const innerEstateId = estateId;
    const innerEntryId = entryId;

    await connectToDatabase();

    const editAccess = await requireEstateEditAccess({
      estateId: innerEstateId,
      userId: session.user.id,
    });

    if (editAccess.role === "VIEWER") {
      redirect(`/app/estates/${innerEstateId}/time/${innerEntryId}?forbidden=1`);
    }

    const dateStr = formData.get("date")?.toString() ?? "";
    const hoursStr = formData.get("hours")?.toString() ?? "0";
    const minutesStr = formData.get("minutes")?.toString() ?? "0";
    const description = formData.get("description")?.toString() ?? "";
    const notes = formData.get("notes")?.toString() ?? "";
    const billable = formData.get("billable") === "on";
    const rateStr = formData.get("rate")?.toString() ?? "";

    let startTime: Date | undefined;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) {
        startTime = parsed;
      }
    }

    const hours = Math.max(Number.parseInt(hoursStr, 10) || 0, 0);
    const minutesUnclamped = Number.parseInt(minutesStr, 10) || 0;
    const minutes = Math.min(Math.max(minutesUnclamped, 0), 59);
    const durationMinutes = Math.max(hours * 60 + minutes, 0);

    let rateCents: number | null = null;
    if (rateStr.trim().length > 0) {
      const cleaned = rateStr.replace(/[,$]/g, "").trim();
      const parsedRate = Number.parseFloat(cleaned);
      if (Number.isFinite(parsedRate) && parsedRate > 0) {
        rateCents = Math.round(parsedRate * 100);
      }
    }

    const updateDoc: Record<string, unknown> = {
      description,
      notes,
      billable,
      durationMinutes,
      rateCents,
    };

    if (startTime) {
      updateDoc.startTime = startTime;
    }

    await TimeEntry.findOneAndUpdate(
      {
        _id: innerEntryId,
        estateId: innerEstateId,
      },
      { $set: updateDoc },
    ).exec();

    revalidatePath(`/app/estates/${innerEstateId}/time`);
    revalidatePath(`/app/estates/${innerEstateId}/time/${innerEntryId}`);
    redirect(`/app/estates/${innerEstateId}/time/${innerEntryId}/edit?saved=1`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <nav className="text-xs text-slate-500">
          <Link
            href="/app/estates"
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estates
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Estate
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <Link
            href={`/app/estates/${estateId}/time`}
            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
          >
            Time
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Edit entry</span>
        </nav>

        {savedFlag ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Saved</p>
                <p className="text-xs text-emerald-200">Your time entry was updated.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}/time/${entryId}`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
              >
                View entry
              </Link>
            </div>
          </div>
        ) : null}

        {forbiddenFlag ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Action blocked</p>
                <p className="text-xs text-rose-200">You don’t have edit permissions for this estate.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Request edit access
              </Link>
            </div>
          </div>
        ) : null}

        {errorCode ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-rose-200">We couldn’t save that change. Please try again.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}/time/${entryId}/edit`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Refresh
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Time entry</span>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Role: {access.role}
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                ID: #{String(entry.id).slice(-6)}
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">Edit time entry</h1>
            <p className="mt-1 text-sm text-slate-400">Update the date, duration, rate, and notes for this entry.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/time/${entryId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              View entry
            </Link>
            <Link
              href={`/app/estates/${estateId}/time`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to time
            </Link>
          </div>
        </div>
      </header>

      <form
        action={updateTimeEntry}
        className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1 md:col-span-1">
            <label htmlFor="date" className="text-xs font-medium text-slate-300">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={startDate}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="hours" className="text-xs font-medium text-slate-300">
                Hours
              </label>
              <input
                id="hours"
                name="hours"
                type="number"
                min={0}
                defaultValue={initialHours}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="minutes" className="text-xs font-medium text-slate-300">
                Minutes
              </label>
              <input
                id="minutes"
                name="minutes"
                type="number"
                min={0}
                max={59}
                defaultValue={initialMinutes}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Billing</p>
              <p className="mt-1 text-xs text-slate-500">Set a rate if you want this time entry to roll into billing totals.</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="billable"
                name="billable"
                type="checkbox"
                defaultChecked={Boolean(entry.billable)}
                className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
              />
              <label htmlFor="billable" className="text-xs font-medium text-slate-300">
                Billable
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="rate" className="text-xs font-medium text-slate-300">
              Hourly rate (optional)
            </label>
            <input
              id="rate"
              name="rate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={rateDisplay}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="e.g. 250.00"
            />
            <p className="text-[11px] text-slate-500">Leave blank to keep this entry non-billable in totals.</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-xs font-medium text-slate-300">
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            defaultValue={entry.description ?? ""}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="e.g. Drafted petition, call with beneficiaries"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-xs font-medium text-slate-300">
            Internal notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={entry.notes ?? ""}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Private context for your team (not shared externally)."
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/app/estates/${estateId}/time/${entryId}`}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Cancel
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/estates/${estateId}/time`}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
            >
              Back to time
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}