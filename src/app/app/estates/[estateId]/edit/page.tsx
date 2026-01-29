// src/app/app/estates/[estateId]/edit/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";
import { EditEstateForm } from "@/components/estate/EditEstateForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function isEstateRole(value: unknown): value is EstateRole {
  return value === "OWNER" || value === "EDITOR" || value === "VIEWER";
}

function getRoleFromAccess(access: unknown): EstateRole {
  if (!access || typeof access !== "object") return "VIEWER";
  const role = (access as Record<string, unknown>).role;
  return isEstateRole(role) ? role : "VIEWER";
}

type EstateDetail = {
  _id: string | { toString(): string };
  name?: string;
  estateName?: string;
  caseNumber?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  county?: string;
  jurisdiction?: string;
  decedentName?: string;
  decedentDateOfDeath?: string | Date;
  notes?: string;
};

interface PageProps {
  params: Promise<{ estateId: string }>;
}

function toISODate(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

async function getEstate(id: string): Promise<EstateDetail | null> {
  await connectToDatabase();

  try {
    const estate = await Estate.findById(id).lean();
    if (!estate) return null;
    return estate as EstateDetail;
  } catch (error) {
    console.error("[GET /app/estates/[estateId]/edit] Error:", error);
    return null;
  }
}

export default async function EditEstatePage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/app/estates/${estateId}/edit`)}`);
  }

  const editAccess = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const role = getRoleFromAccess(editAccess);

  if (role === "VIEWER") {
    redirect(`/app/estates/${estateId}/collaborators?${new URLSearchParams({ request: "EDITOR", from: "estate-edit" }).toString()}`);
  }

  const estate = await getEstate(estateId);
  if (!estate) return notFound();

  const title = estate.name || estate.estateName || "Untitled estate";
  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";

  const initialData = {
    name: estate.name ?? estate.estateName ?? "",
    caseNumber: estate.caseNumber ?? estate.courtCaseNumber ?? "",
    county: estate.county ?? estate.jurisdiction ?? "",
    decedentName: estate.decedentName ?? "",
    status: estate.status ?? "Draft",
    decedentDateOfDeath: toISODate(estate.decedentDateOfDeath),
    notes: estate.notes ?? "",
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Edit estate</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
          <p className="mt-1 text-xs text-slate-400">Case #{caseNumber}</p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
            {role}
          </span>
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
          >
            Back to estate
          </Link>
        </div>
      </div>

      <EditEstateForm estateId={estateId} initialData={initialData} />
    </div>
  );
}