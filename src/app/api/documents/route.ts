import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument, normalizeEstateDocumentTags } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";

type DocumentItem = {
  _id: string;
  estateId: string;
  label: string;
  subject: string;
  sensitivity: "LOW" | "MEDIUM" | "HIGH";
  tags: string[];
  url?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeSensitivity(raw: unknown): "LOW" | "MEDIUM" | "HIGH" {
  if (typeof raw !== "string") return "LOW";
  const up = raw.toUpperCase();
  if (up === "MEDIUM" || up === "HIGH") return up;
  return "LOW";
}

function normalizeSubject(raw: unknown): string {
  if (typeof raw !== "string") return "OTHER";
  const v = raw.trim();
  return v.length ? v : "OTHER";
}

function docToItem(doc: unknown): DocumentItem {
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
    tags: Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    url: getString("url") ?? null,
    notes: getString("notes") ?? null,
    createdAt: getDateIso("createdAt"),
    updatedAt: getDateIso("updatedAt"),
  };
}

/**
 * GET /api/documents?estateId=...&q=...&subject=...&sensitivity=...
 * If estateId is provided, access is enforced.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const estateId = url.searchParams.get("estateId")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const subject = url.searchParams.get("subject")?.trim() ?? "";
  const sensitivity = url.searchParams.get("sensitivity")?.trim() ?? "";
  const tag = url.searchParams.get("tag")?.trim() ?? "";

  if (!estateId) {
    // For now: documents are estate-scoped in LegatePro.
    return NextResponse.json(
      { ok: false, error: "estateId is required" },
      { status: 400 }
    );
  }

  await connectToDatabase();

  await requireEstateAccess({ estateId, userId: session.user.id });

  const query: Record<string, unknown> = { estateId };

  if (subject && subject.toUpperCase() !== "ALL") {
    query.subject = subject;
  }
  if (sensitivity && sensitivity.toUpperCase() !== "ALL") {
    query.sensitivity = normalizeSensitivity(sensitivity);
  }
  if (tag) {
    // tags are normalized to lowercase in the model
    query.tags = tag.toLowerCase();
  }
  if (q) {
    // label + notes + url quick search
    query.$or = [
      { label: { $regex: q, $options: "i" } },
      { notes: { $regex: q, $options: "i" } },
      { url: { $regex: q, $options: "i" } },
      { fileName: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ];
  }

  const docs = await EstateDocument.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
    .exec();

  const documents = Array.isArray(docs) ? docs.map(docToItem) : [];

  return NextResponse.json({ ok: true, documents }, { status: 200 });
}

/**
 * POST /api/documents
 * Body: { estateId, label, subject, sensitivity, url?, notes? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const typed = (body ?? {}) as {
    estateId?: string;
    label?: string;
    subject?: string;
    sensitivity?: string;
    url?: string;
    notes?: string;
    tags?: unknown;
  };

  const estateId = (typed.estateId ?? "").trim();
  const label = (typed.label ?? "").trim();
  const subject = normalizeSubject(typed.subject);
  const sensitivity = normalizeSensitivity(typed.sensitivity);
  const url = typeof typed.url === "string" ? typed.url.trim() : "";
  const notes = typeof typed.notes === "string" ? typed.notes.trim() : "";
  const tags = normalizeEstateDocumentTags(typed.tags);

  if (!estateId) {
    return NextResponse.json({ ok: false, error: "estateId is required" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ ok: false, error: "label is required" }, { status: 400 });
  }

  await connectToDatabase();

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const created = await EstateDocument.create({
    estateId,
    ownerId: session.user.id,
    label,
    subject,
    sensitivity,
    tags,
    url: url || undefined,
    notes: notes || undefined,
  });

  return NextResponse.json({ ok: true, document: docToItem(created) }, { status: 201 });
}