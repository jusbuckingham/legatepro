import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function roleAtLeast(role: EstateRole, minRole: EstateRole): boolean {
  const order: Record<EstateRole, number> = { OWNER: 3, EDITOR: 2, VIEWER: 1 };
  return order[role] >= order[minRole];
}

type PageProps = {
  params: Promise<{ estateId: string; documentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

interface EstateDocumentLean {
  _id: { toString(): string };
  subject: string;
  label: string;
  location?: string;
  url?: string;
  tags?: string[];
  notes?: string;
  isSensitive?: boolean;
}

const SUBJECT_LABELS: Record<string, string> = {
  BANKING: "Banking",
  AUTO: "Auto",
  MEDICAL: "Medical",
  INCOME_TAX: "Income tax",
  PROPERTY: "Property",
  INSURANCE: "Insurance",
  IDENTITY: "Identity / ID",
  LEGAL: "Legal",
  ESTATE_ACCOUNTING: "Estate accounting",
  RECEIPTS: "Receipts",
  OTHER: "Other",
};

/**
 * Server action: delete this document index entry.
 * Requires EDITOR access. Uses a confirmation checkbox to avoid accidents.
 */
async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const documentId = formData.get("documentId")?.toString();
  const confirm = formData.get("confirmDelete")?.toString();

  if (!estateId || !documentId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  if (confirm !== "on") {
    redirect(`/app/estates/${estateId}/documents/${documentId}?confirm=1`);
  }

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
  });

  redirect(`/app/estates/${estateId}/documents?deleted=1`);
}

export default async function EstateDocumentDetailPage({ params, searchParams }: PageProps) {
  const { estateId, documentId } = await params;

  const sp = searchParams ? await searchParams : undefined;

  const getParam = (key: string): string => {
    const raw = sp?.[key];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return "";
  };

  // Optional banner trigger when we redirect viewers away from edit actions
  const forbiddenRaw = getParam("forbidden");
  const confirmRaw = getParam("confirm");

  const forbidden = forbiddenRaw === "1" || forbiddenRaw.toLowerCase() === "true";
  const confirmNeeded = confirmRaw === "1" || confirmRaw.toLowerCase() === "true";

  const requestAccessHref = `/app/estates/${estateId}/collaborators?${
    new URLSearchParams({
      request: "EDITOR",
      from: "document",
      documentId,
    }).toString()
  }`;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`);
  }

  const access = (await requireEstateAccess({ estateId, userId: session.user.id })) as { role: EstateRole };
  const canEdit = roleAtLeast(access.role, "EDITOR");

  await connectToDatabase();

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
  })
    .lean<EstateDocumentLean | null>()
    .exec();

  if (!doc) {
    notFound();
  }

  const tagsArray = Array.isArray(doc.tags) ? doc.tags : [];

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Documents
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-200">{doc.label || "Document"}</span>
          </nav>
        }
        title="Document details"
        description="View how this document is indexed for the estate (subject, label, location, tags, notes, and sensitivity)."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {access.role}
            </span>
            {(!canEdit || forbidden) && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                View-only
              </span>
            )}
            {doc.isSensitive && (
              <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                Sensitive
              </span>
            )}

            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back
            </Link>

            {canEdit && !forbidden && (
              <Link
                href={`/app/estates/${estateId}/documents/${documentId}/edit`}
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Edit
              </Link>
            )}

            {(!canEdit || forbidden) && (
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request access
              </Link>
            )}

            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20"
              >
                Open linked file
              </a>
            )}
          </div>
        }
      />

      {/* Notices */}
      <div className="space-y-3">
        {doc.isSensitive && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-100">
            <p className="font-semibold">Sensitive document</p>
            <p className="mt-0.5 text-xs text-rose-200/90">
              Treat this entry as confidential. Avoid sharing the location or link unless necessary.
            </p>
          </div>
        )}

        {confirmNeeded && canEdit && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-100">
            <p className="font-semibold">Confirm delete to continue</p>
            <p className="mt-0.5 text-xs text-amber-200/90">
              Please check the confirmation box in the Danger zone before deleting this index entry.
            </p>
          </div>
        )}

        {(!canEdit || forbidden) && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-sm text-amber-100">
            <p className="font-semibold">
              {forbidden ? "You don’t have permission to do that" : "You can view, but not edit"}
            </p>
            <p className="mt-0.5 text-xs text-amber-200/90">
              {forbidden
                ? "This action requires EDITOR access."
                : `Your role is ${access.role}. Ask an OWNER to grant EDITOR access if you need to make changes.`}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request editor access
              </Link>
              <p className="text-[11px] text-amber-200/80">
                Tip: If you’re the OWNER, invite yourself from Collaborators.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subject</p>
            <p className="mt-1 text-sm font-medium text-slate-50">
              {SUBJECT_LABELS[doc.subject] ?? doc.subject ?? "—"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{doc.location || "—"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Document label</p>
          <p className="mt-1 text-sm font-medium text-slate-50">{doc.label || "—"}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Link / URL</p>
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center text-sm font-medium text-emerald-200 hover:text-emerald-300 underline-offset-2 hover:underline"
              >
                {doc.url}
              </a>
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-50">—</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tags</p>
            {tagsArray.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tagsArray.map((t) => (
                  <span
                    key={t}
                    className="inline-flex rounded-full border border-slate-700 bg-slate-900/40 px-2 py-0.5 text-[11px] font-medium text-slate-200"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-50">—</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</p>
          {doc.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{doc.notes}</p>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-50">—</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/app/estates/${estateId}/documents`}
            className="text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
          >
            Back to index
          </Link>

          <div className="flex items-center gap-2">
            {(!canEdit || forbidden) && (
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request access
              </Link>
            )}
            {canEdit && (
              <Link
                href={`/app/estates/${estateId}/documents/${documentId}/edit`}
                className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-rose-400"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
      </section>

      {canEdit ? (
        <section className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-rose-100">Danger zone</h2>
            <p className="mt-1 text-xs text-rose-200/80">
              Deleting removes the document <span className="font-semibold">index entry</span> from this estate. It
              does not delete any external file you linked.
            </p>
          </div>

          <form action={deleteDocument} className="space-y-3">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="documentId" value={documentId} />

            <label className="flex items-start gap-2 text-xs text-rose-100">
              <input
                type="checkbox"
                name="confirmDelete"
                className="mt-0.5 h-4 w-4 rounded border-rose-500/40 bg-slate-950 text-rose-400 focus:ring-rose-400"
              />
              <span>
                I understand this will remove the document index entry for <span className="font-semibold">{doc.label || "this document"}</span>.
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Delete index entry
              </button>

              <p className="text-[11px] text-rose-200/70">
                Tip: if you only need to change label/subject, use Edit instead.
              </p>
            </div>
          </form>
        </section>
      ) : null}

    </div>
  );
}