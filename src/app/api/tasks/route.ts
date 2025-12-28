// src/app/api/tasks/route.ts
// Tasks API for LegatePro (estate to‑do list / required actions)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";
import { requireViewer, requireEditor } from "@/lib/estateAccess";

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
    const q = searchParams.get("q")?.trim() ?? "";

    if (!estateId) {
      return NextResponse.json(
        { ok: false, error: "estateId is required" },
        { status: 400 }
      );
    }

    // Viewer access is sufficient to read tasks
    const access = await requireViewer({ estateId });
    if (access instanceof Response) return access;

    await connectToDatabase();

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
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const tasks = await Task.find(filter)
      .sort({ isCompleted: 1, dueDate: 1 })
      .lean()
      .exec();

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
    let body: CreateTaskBody;
    try {
      body = (await request.json()) as CreateTaskBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
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

    const access = await requireEditor({ estateId });
    if (access instanceof Response) return access;

    await connectToDatabase();

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

    const task = await Task.create({
      estateId,
      title,
      category: category || undefined,
      dueDate: parsedDueDate,
      notes: notes || undefined,
      isCompleted: typeof isCompleted === "boolean" ? isCompleted : false,
    });

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