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
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// GET /api/time?estateId=...
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      .lean()) as TimeEntryDocLean[];

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

    return NextResponse.json({ entries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time] Error:", error);
    return NextResponse.json(
      { error: "Failed to load time entries" },
      { status: 500 }
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

// POST /api/time
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { estateId, taskId, description, date, hours, minutes, rate } =
      await parseTimePostBody(req);

    if (!estateId) {
      return NextResponse.json(
        { error: "Missing estateId" },
        { status: 400 }
      );
    }

    // Compute total minutes from hours + minutes fields
    const hoursNumber =
      hours && hours.trim() !== "" ? Number.parseFloat(hours) : 0;
    const minutesNumber =
      minutes && minutes.trim() !== "" ? Number.parseInt(minutes, 10) : 0;

    const totalMinutes =
      Number.isFinite(hoursNumber) && hoursNumber > 0
        ? Math.round(hoursNumber * 60) + minutesNumber
        : minutesNumber;

    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      return NextResponse.json(
        {
          error:
            "Please provide a positive amount of time (hours and/or minutes).",
        },
        { status: 400 }
      );
    }

    const rateNumber =
      rate && rate.trim() !== "" ? Number.parseFloat(rate) : undefined;

    const entryDoc = await TimeEntry.create({
      estateId,
      taskId: taskId || undefined,
      description: description?.trim() ?? "",
      minutes: totalMinutes,
      date: date ? new Date(date) : new Date(),
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

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to create time entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// (optional) you can add DELETE or other verbs here later if needed