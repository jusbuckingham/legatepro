// src/app/api/tasks/route.ts
// Tasks API for LegatePro (estate to‑do list / required actions)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Task } from "@/models/Task";
import { requireViewer, requireEditor } from "@/lib/estateAccess";
import mongoose from "mongoose";

const MAX_QUERY_LEN = 64;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidObjectIdString(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

interface CreateTaskBody {
  estateId?: string;
  title?: string;
  category?: string;
  dueDate?: string | null;
  notes?: string;
  isCompleted?: boolean;
}

// GET /api/tasks
// Optional query params:
//   estateId: string            -> filter by estate (required for access check)
//   completed: "true" | "false" -> filter by completion
//   category: string            -> filter by task category
//   q: string                   -> search by title or notes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const completed = searchParams.get("completed");
    const category = searchParams.get("category");
    const q = (searchParams.get("q")?.trim() ?? "").slice(0, MAX_QUERY_LEN);

    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!isValidObjectIdString(estateId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid estateId" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Viewer access is sufficient to read tasks
    const access = await requireViewer({ estateId });
    if (access instanceof Response) return access;

    const filter: Record<string, unknown> = { estateId };

    if (category) {
      filter.category = category;
    }

    if (completed === "true") {
      filter.isCompleted = true;
    } else if (completed === "false") {
      filter.isCompleted = false;
    }

    if (q) {
      const safeQ = escapeRegex(q);
      filter.$or = [
        { title: { $regex: safeQ, $options: "i" } },
        { notes: { $regex: safeQ, $options: "i" } },
      ];
    }

    const tasksRaw = await Task.find(filter)
      .sort({ isCompleted: 1, dueDate: 1 })
      .lean()
      .exec();

    const tasks = tasksRaw.map((t) => serializeMongoDoc(t));

    return NextResponse.json({ ok: true, data: { tasks } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/tasks error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load tasks" },
      { status: 500 }
    );
  }
}

// POST /api/tasks
// Creates a new task (Owner / Editor only)
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => null);
    if (!isPlainObject(raw)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const body = raw as CreateTaskBody;

    const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
    if (estateId && !isValidObjectIdString(estateId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid estateId" },
        { status: 400 }
      );
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : undefined;
    const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
    const dueDate = body.dueDate ?? null;
    const isCompleted = body.isCompleted;

    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "estateId is required" },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "title is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const access = await requireEditor({ estateId });
    if (access instanceof Response) return access;

    let parsedDueDate: Date | undefined;
    if (typeof dueDate === "string" && dueDate.trim()) {
      const d = new Date(dueDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { ok: false, error: "dueDate must be a valid ISO date" },
          { status: 400 }
        );
      }
      parsedDueDate = d;
    }

    const taskDoc = await Task.create({
      estateId,
      title,
      category: category || undefined,
      dueDate: parsedDueDate,
      notes: notes || undefined,
      isCompleted: typeof isCompleted === "boolean" ? isCompleted : false,
    });

    const task = serializeMongoDoc(taskDoc);

    return NextResponse.json(
      { ok: true, data: { task } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/tasks error", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create task" },
      { status: 500 }
    );
  }
}