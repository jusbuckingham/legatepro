import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";

type Sensitivity = "LOW" | "MEDIUM" | "HIGH";

function normalizeSensitivity(raw: unknown): Sensitivity {
  if (typeof raw !== "string") return "LOW";
  const up = raw.toUpperCase();
  if (up === "MEDIUM" || up === "HIGH") return up as Sensitivity;
  return "LOW";
}

function normalizeSubject(raw: unknown): string {
  if (typeof raw !== "string") return "OTHER";
  const v = raw.trim();
  return v.length ? v : "OTHER";
}

function docToItem(doc: unknown) {
  const d = (doc ?? {}) as Record<string, unknown>;

  const getString = (key: string): string | undefined => {
    const v = d[key];
    return typeof v === "string" ? v : undefined;
  };

  const getDateIso = (key: string): string | undefined => {
    const v = d[key];
    if (!v) return undefined;
    const dt = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
  };

  return {
    _id: String(d._id ?? ""),
    estateId: String(d.estateId ?? ""),
    label: getString("label") ?? "Document",
    subject: getString("subject") ?? "OTHER",
    sensitivity: normalizeSensitivity(d.sensitivity),
    url: getString("url") ?? null,
    notes: getString("notes") ?? null,
    createdAt: getDateIso("createdAt"),
    updatedAt: getDateIso("updatedAt"),
  };
}

async function getDocOr404(documentId: string) {
  const doc = await EstateDocument.findById(documentId).lean().exec();
  return doc ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { documentId } = await ctx.params;
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Missing documentId" }, { status: 400 });
  }

  const doc = await getDocOr404(documentId);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await requireEstateAccess({ estateId: String(doc.estateId), userId: session.user.id });

  return NextResponse.json({ ok: true, document: docToItem(doc) }, { status: 200 });
}

/**
 * PATCH /api/documents/:documentId
 * Body: { label?, subject?, sensitivity?, url?, notes? }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { documentId } = await ctx.params;
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Missing documentId" }, { status: 400 });
  }

  const existing = await getDocOr404(documentId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const estateId = String(existing.estateId);
  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const typed = (body ?? {}) as {
    label?: string;
    subject?: string;
    sensitivity?: string;
    url?: string | null;
    notes?: string | null;
  };

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, "" | 1> = {};

  if (typeof typed.label === "string") {
    const v = typed.label.trim();
    if (!v) {
      return NextResponse.json(
        { ok: false, error: "label cannot be empty" },
        { status: 400 },
      );
    }
    $set.label = v;
  }

  if (typed.subject !== undefined) {
    $set.subject = normalizeSubject(typed.subject);
  }

  if (typed.sensitivity !== undefined) {
    $set.sensitivity = normalizeSensitivity(typed.sensitivity);
  }

  if (typed.url !== undefined) {
    const v = typeof typed.url === "string" ? typed.url.trim() : "";
    if (v.length) {
      $set.url = v;
    } else {
      $unset.url = 1;
    }
  }

  if (typed.notes !== undefined) {
    const v = typeof typed.notes === "string" ? typed.notes.trim() : "";
    if (v.length) {
      $set.notes = v;
    } else {
      $unset.notes = 1;
    }
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const updated = await EstateDocument.findOneAndUpdate(
    { _id: documentId, estateId },
    update,
    { new: true }
  )
    .lean()
    .exec();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, document: docToItem(updated) }, { status: 200 });
}

/**
 * DELETE /api/documents/:documentId
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const { documentId } = await ctx.params;
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Missing documentId" }, { status: 400 });
  }

  const existing = await getDocOr404(documentId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const estateId = String(existing.estateId);
  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  await EstateDocument.findOneAndDelete({ _id: documentId, estateId });

  return NextResponse.json({ ok: true }, { status: 200 });
}