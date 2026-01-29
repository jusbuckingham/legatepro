import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { Estate } from "@/models/Estate";

import PageHeader from "@/components/layout/PageHeader";

export const metadata = {
  title: "Estate settings | LegatePro",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type EstateSettingsShape = {
  id: string;
  decedentName?: string | null;
  caseNumber?: string | null;
  courtName?: string | null;
  dateOfDeath?: string | Date | null;
  openedAt?: string | Date | null;
  status?: string | null;
};

type PageProps = {
  params: Promise<{ estateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

function canEdit(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

async function loadEstate(estateId: string): Promise<EstateSettingsShape | null> {
  await connectToDatabase();

  if (!estateId) return null;

  try {
    const raw = await Estate.findById(estateId).lean();
    if (!raw) return null;

    const doc = serializeMongoDoc(raw) as Record<string, unknown>;

    const id =
      typeof doc.id === "string"
        ? doc.id
        : typeof doc._id === "string"
          ? doc._id
          : doc._id && typeof doc._id === "object" && "toString" in doc._id
            ? String((doc._id as { toString(): string }).toString())
            : "";

    if (!id) return null;

    return {
      id,
      decedentName: typeof doc.decedentName === "string" ? doc.decedentName : null,
      caseNumber: typeof doc.caseNumber === "string" ? doc.caseNumber : null,
      courtName: typeof doc.courtName === "string" ? doc.courtName : null,
      dateOfDeath:
        typeof doc.dateOfDeath === "string" || doc.dateOfDeath instanceof Date
          ? (doc.dateOfDeath as string | Date)
          : null,
      openedAt:
        typeof doc.openedAt === "string" || doc.openedAt instanceof Date
          ? (doc.openedAt as string | Date)
          : null,
      status: typeof doc.status === "string" ? doc.status : null,
    };
  } catch (error) {
    // Gracefully handle invalid ObjectId values
    console.error("[EstateSettingsPage] Failed to load estate", { estateId, error });
    return null;
  }
}

export default async function EstateSettingsPage({ params, searchParams }: PageProps) {
  const { estateId } = await params;
  if (!estateId) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const forbidden = sp?.forbidden === "1";

  const session = await auth();
  if (!session?.user?.id) {
    const cb = encodeURIComponent(`/app/estates/${estateId}/settings`);
    redirect(`/login?callbackUrl=${cb}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  const editEnabled = canEdit(role);

  const estate = await loadEstate(estateId);
  if (!estate) {
    notFound();
  }

  const safeEstateId = encodeURIComponent(estateId);
  const decedentName = (estate.decedentName ?? "").trim() || "Unknown";
  const caseNumber = (estate.caseNumber ?? "").trim() || "Not set";
  const courtName = (estate.courtName ?? "").trim() || "Not set";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link
              href="/app/estates"
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${safeEstateId}`}
              className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Estate
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Settings</span>
          </nav>
        }
        title="Estate settings"
        description="Review core estate details and manage collaborator access."
        actions={
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              Role: {roleLabel(role)}
            </span>
            {!editEnabled ? (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                Read-only
              </span>
            ) : null}
          </div>
        }
      />

      {forbidden ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to manage collaborators.
              </p>
            </div>
            <Link
              href={`/app/estates/${safeEstateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {!editEnabled ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view estate settings, but you can’t edit details or manage collaborators.
              </p>
            </div>
            <Link
              href={`/app/estates/${safeEstateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Decedent</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{decedentName}</p>
          <p className="mt-1 text-xs text-slate-500">Displayed across your workspace.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Case number</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{caseNumber}</p>
          <p className="mt-1 text-xs text-slate-500">Used in court packets & filings.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Court</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{courtName}</p>
          <p className="mt-1 text-xs text-slate-500">Keep this consistent with letters of authority.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Timeline</h2>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Date of death</span>
              <span className="font-medium text-slate-100">{formatDate(estate.dateOfDeath)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Opened</span>
              <span className="font-medium text-slate-100">{formatDate(estate.openedAt)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Access</h2>
          <p className="text-xs text-slate-400">
            Collaborators determine who can view or edit this estate.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/estates/${safeEstateId}/settings/collaborators${editEnabled ? "" : "?forbidden=1"}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
            >
              Collaborators
            </Link>

            {!editEnabled ? (
              <Link
                href={`/app/estates/${safeEstateId}?requestAccess=1`}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            ) : null}
          </div>

          <p className="text-[11px] text-slate-500">
            Tip: keep collaborators minimal to reduce accidental edits.
          </p>
        </div>
      </section>
    </div>
  );
}