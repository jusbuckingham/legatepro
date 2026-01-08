import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { TimeEntry } from "@/models/TimeEntry";

type PageProps = {
  params: Promise<{
    estateId: string;
    entryId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Time Entry | LegatePro",
};

export default async function EstateTimeEntryEditPage({ params }: PageProps) {
  const { estateId, entryId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const rawEntry = await TimeEntry.findOne({
    _id: entryId,
    estateId,
    ownerId: session.user.id,
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

  const startDate = entry.startTime
    ? new Date(entry.startTime).toISOString().slice(0, 10)
    : "";

  const rateDisplay =
    typeof entry.rateCents === "number"
      ? (entry.rateCents / 100).toFixed(2)
      : "";

  async function updateTimeEntry(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user?.id) {
      redirect("/login");
    }

    await connectToDatabase();

    const entryId = formData.get("entryId")?.toString() ?? "";
    const estateId = formData.get("estateId")?.toString() ?? "";

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

    const hours = Number.parseInt(hoursStr, 10) || 0;
    const minutes = Number.parseInt(minutesStr, 10) || 0;
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
        _id: entryId,
        estateId,
        ownerId: session.user.id,
      },
      { $set: updateDoc },
    ).exec();

    redirect(`/app/estates/${estateId}/time`);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Time tracking
        </p>
        <h1 className="text-2xl font-semibold text-slate-100">
          Edit time entry
        </h1>
        <p className="text-sm text-slate-400">
          Update the date, duration, rate, and notes for this time entry.
        </p>
      </header>

      <form
        action={updateTimeEntry}
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
      >
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="estateId" value={estateId} />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="date"
            className="text-xs font-medium text-slate-300"
          >
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="hours"
              className="text-xs font-medium text-slate-300"
            >
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
            <label
              htmlFor="minutes"
              className="text-xs font-medium text-slate-300"
            >
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

        <div className="flex flex-col gap-1">
          <label
            htmlFor="rate"
            className="text-xs font-medium text-slate-300"
          >
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
          <p className="text-[11px] text-slate-500">
            If set, this entry can be used for billing calculations based on
            time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="billable"
            name="billable"
            type="checkbox"
            defaultChecked={Boolean(entry.billable)}
            className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
          />
          <label
            htmlFor="billable"
            className="text-xs font-medium text-slate-300"
          >
            Mark as billable
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="description"
            className="text-xs font-medium text-slate-300"
          >
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
          <label
            htmlFor="notes"
            className="text-xs font-medium text-slate-300"
          >
            Internal notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={entry.notes ?? ""}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Add any extra internal context about this time entry."
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Link
            href={`/app/estates/${estateId}/time`}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back to time entries
          </Link>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}