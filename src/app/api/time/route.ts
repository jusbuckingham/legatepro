import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { TimeEntry } from "@/models/TimeEntry";

/**
 * Shape of a lean TimeEntry document we care about in this endpoint.
 * We deliberately keep ObjectId-like values as `unknown` and normalize to strings.
 */
type TimeEntryDocLean = {
  _id: unknown;
  estateId: unknown;
  taskId?: unknown;
  description: string;
  minutes: number;
  date: Date;
  rate?: number;
  ownerId: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export const dynamic = "force-dynamic";

function toStringId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toString?: unknown }).toString === "function") {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

// helper to detect if request is a form POST
function isHtmlFormPost(req: NextRequest): boolean {
  const contentType = req.headers.get("content-type") || "";
  return !contentType.includes("application/json");
}

// helper to redirect with error message
function redirectWithError(req: NextRequest, message: string): NextResponse {
  const url = new URL("/app/time/new", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

// GET /api/time?estateId=...
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const estateId = searchParams.get("estateId");

    await connectToDatabase();

    const query: Record<string, unknown> = {
      ownerId: session.user.id,
    };

    if (estateId) {
      query.estateId = estateId;
    }

    const docs = (await TimeEntry.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .lean()
      .exec()) as TimeEntryDocLean[];

    const entries = docs.map((doc) => ({
      id: toStringId(doc._id),
      estateId: toStringId(doc.estateId),
      taskId: doc.taskId ? toStringId(doc.taskId) : undefined,
      description: doc.description,
      minutes: doc.minutes,
      date: doc.date.toISOString(),
      rate: typeof doc.rate === "number" ? doc.rate : undefined,
      ownerId: toStringId(doc.ownerId),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));

    return NextResponse.json({ ok: true, entries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load time entries" },
      { status: 500 },
    );
  }
}

// helper to normalize POST body from JSON or form-data
async function parseTimePostBody(
  req: NextRequest
): Promise<{
  estateId?: string;
  taskId?: string;
  description?: string;
  date?: string;
  hours?: string;
  minutes?: string;
  rate?: string;
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = (await req.json()) as Record<string, unknown>;
    return {
      estateId: json.estateId as string | undefined,
      taskId: json.taskId as string | undefined,
      description: json.description as string | undefined,
      date: json.date as string | undefined,
      hours: json.hours?.toString(),
      minutes: json.minutes?.toString(),
      rate: json.rate?.toString(),
    };
  }

  // assume form submission
  const form = await req.formData();
  return {
    estateId: form.get("estateId")?.toString(),
    taskId: form.get("taskId")?.toString(),
    description: form.get("description")?.toString(),
    date: form.get("date")?.toString(),
    hours: form.get("hours")?.toString(),
    minutes: form.get("minutes")?.toString(),
    rate: form.get("rate")?.toString(),
  };
}


function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseOptionalFiniteNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// POST /api/time
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { estateId, taskId, description, date, hours, minutes, rate } =
      await parseTimePostBody(req);

    const wantsRedirect = isHtmlFormPost(req);

    if (date && date.trim() !== "" && !parseOptionalDate(date)) {
      if (wantsRedirect) return redirectWithError(req, "Date must be valid.");
      return NextResponse.json(
        { ok: false, error: "date must be a valid ISO date" },
        { status: 400 },
      );
    }

    if (!estateId) {
      if (wantsRedirect) return redirectWithError(req, "Please select an estate.");
      return NextResponse.json(
        { ok: false, error: "Missing estateId" },
        { status: 400 },
      );
    }

    // Compute total minutes from hours + minutes fields
    const hoursNumberRaw = hours?.trim() ?? "";
    const minutesNumberRaw = minutes?.trim() ?? "";

    const hoursNumber = hoursNumberRaw ? Number.parseFloat(hoursNumberRaw) : 0;
    const minutesNumber = minutesNumberRaw ? Number.parseInt(minutesNumberRaw, 10) : 0;

    if (
      (hoursNumberRaw && !Number.isFinite(hoursNumber)) ||
      (minutesNumberRaw && !Number.isFinite(minutesNumber))
    ) {
      if (wantsRedirect) {
        return redirectWithError(req, "Hours/minutes must be valid numbers.");
      }
      return NextResponse.json(
        { ok: false, error: "Hours/minutes must be valid numbers." },
        { status: 400 },
      );
    }

    if (hoursNumber < 0 || minutesNumber < 0) {
      if (wantsRedirect) return redirectWithError(req, "Hours/minutes cannot be negative.");
      return NextResponse.json(
        { ok: false, error: "Hours/minutes cannot be negative." },
        { status: 400 },
      );
    }

    const totalMinutes =
      hoursNumber > 0 ? Math.round(hoursNumber * 60) + minutesNumber : minutesNumber;

    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      if (wantsRedirect) {
        return redirectWithError(req, "Please provide a positive amount of time.");
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Please provide a positive amount of time (hours and/or minutes).",
        },
        { status: 400 },
      );
    }

    const rateNumber = parseOptionalFiniteNumber(rate);
    if (rate && rate.trim() !== "" && typeof rateNumber !== "number") {
      if (wantsRedirect) return redirectWithError(req, "Rate must be a valid number.");
      return NextResponse.json(
        { ok: false, error: "Rate must be a valid number." },
        { status: 400 },
      );
    }

    const entryDoc = await TimeEntry.create({
      estateId,
      taskId: taskId || undefined,
      description: description?.trim() ?? "",
      minutes: totalMinutes,
      date: parseOptionalDate(date) ?? new Date(),
      rate: rateNumber,
      ownerId: session.user.id,
    });

    const entry = {
      id: toStringId(entryDoc._id),
      estateId: toStringId(entryDoc.estateId),
      taskId:
        "taskId" in entryDoc && entryDoc.taskId != null
          ? toStringId(entryDoc.taskId as unknown)
          : undefined,
      description: entryDoc.description,
      minutes: entryDoc.minutes,
      date: toIsoString(entryDoc.date as unknown),
      rate:
        "rate" in entryDoc && typeof entryDoc.rate === "number"
          ? entryDoc.rate
          : undefined,
      ownerId: toStringId(entryDoc.ownerId as unknown),
      createdAt: toIsoString(entryDoc.createdAt as unknown),
      updatedAt: toIsoString(entryDoc.updatedAt as unknown),
    };

    if (wantsRedirect) {
      const url = new URL("/app/time", req.url);
      url.searchParams.set("created", "1");
      url.searchParams.set("estateId", estateId);
      return NextResponse.redirect(url, { status: 303 });
    }

    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to create time entry";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/time?id=...&estateId=...
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const estateId = searchParams.get("estateId");

    if (!id || id.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "Missing id for time entry to delete" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const deleteQuery: Record<string, unknown> = {
      _id: id,
      ownerId: session.user.id,
    };

    if (estateId) {
      deleteQuery.estateId = estateId;
    }

    const deleted = await TimeEntry.findOneAndDelete(deleteQuery).lean().exec();

    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: "Time entry not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/time] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete time entry" },
      { status: 500 },
    );
  }
}