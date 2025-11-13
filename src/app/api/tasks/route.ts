

// src/app/api/tasks/route.ts
// Tasks API for LegatePro (estate to‑do list / required actions)

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/db";
import { Task } from "../../../models/Task";

// GET /api/tasks
// Optional query params:
//   estateId: string            -> filter by estate
//   completed: "true" | "false" -> filter by completion
//   category: string            -> filter by task category
//   q: string                   -> search by title or notes
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth

    const { searchParams } = new URL(request.url);
    const estateId = searchParams.get("estateId");
    const completed = searchParams.get("completed");
    const category = searchParams.get("category");
    const q = searchParams.get("q")?.trim() ?? "";

    const filter: Record<string, unknown> = { ownerId };

    if (estateId) filter.estateId = estateId;
    if (category) filter.category = category;

    if (completed === "true") filter.isCompleted = true;
    if (completed === "false") filter.isCompleted = false;

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const tasks = await Task.find(filter)
      .sort({ isCompleted: 1, dueDate: 1 })
      .lean();

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error("GET /api/tasks error", error);
    return NextResponse.json({ error: "Unable to load tasks" }, { status: 500 });
  }
}

// POST /api/tasks
// Creates a new task
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const ownerId = "demo-user"; // TODO: replace with real auth
    const body = await request.json();

    const {
      estateId,
      title,
      category,
      dueDate,
      notes,
      isCompleted,
    } = body ?? {};

    if (!estateId) {
      return NextResponse.json({ error: "estateId is required" }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const task = await Task.create({
      ownerId,
      estateId,
      title,
      category,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      isCompleted: typeof isCompleted === "boolean" ? isCompleted : false,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error", error);
    return NextResponse.json({ error: "Unable to create task" }, { status: 500 });
  }
}