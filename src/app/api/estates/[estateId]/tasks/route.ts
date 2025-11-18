import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Task } from "@/models/Task";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{
    estateId: string;
  }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId } = await params;

    if (!estateId) {
      return NextResponse.json(
        { error: "Missing estateId" },
        { status: 400 }
      );
    }

    const tasks = await Task.find({ estateId })
      .sort({ date: 1, createdAt: -1 })
      .lean();

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/estates/[estateId]/tasks] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { estateId } = await params;

    if (!estateId) {
      return NextResponse.json(
        { error: "Missing estateId" },
        { status: 400 }
      );
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      subject: string;
      description?: string;
      notes?: string;
      status?: "OPEN" | "DONE";
      priority?: "LOW" | "MEDIUM" | "HIGH";
      date?: string | null;
    };

    if (!body.subject?.trim()) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }

    const payload = {
      subject: body.subject.trim(),
      description: body.description ?? "",
      notes: body.notes ?? "",
      status: body.status ?? "OPEN",
      priority: body.priority ?? "MEDIUM",
      date: body.date ? new Date(body.date) : undefined,
      estateId,
      // if your Task model has ownerId/createdBy, add it here:
      // ownerId: userId,
    };

    const task = await Task.create(payload);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/estates/[estateId]/tasks] Error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}