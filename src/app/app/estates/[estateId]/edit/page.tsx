// src/app/app/estates/[estateId]/edit/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { EditEstateForm } from "@/components/estate/EditEstateForm";

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

  const estate = await getEstate(estateId);

  if (!estate) {
    return notFound();
  }

  const title = estate.name || estate.estateName || "Untitled estate";
  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";

  const initialData = {
    name: estate.name ?? estate.estateName ?? "",
    caseNumber: estate.caseNumber ?? estate.courtCaseNumber ?? "",
    county: estate.county ?? estate.jurisdiction ?? "",
    decedentName: estate.decedentName ?? "",
    status: estate.status ?? "Draft",
    decedentDateOfDeath: estate.decedentDateOfDeath
      ? new Date(estate.decedentDateOfDeath).toISOString().slice(0, 10)
      : "",
    notes: estate.notes ?? ""
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            Edit estate
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {title}
          </h1>
          <p className="mt-1 text-xs text-slate-400">Case #{caseNumber}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to estate
          </Link>
        </div>
      </div>

      <EditEstateForm estateId={estateId} initialData={initialData} />
    </div>
  );
}