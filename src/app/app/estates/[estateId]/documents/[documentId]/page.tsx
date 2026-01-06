import Link from "next/link";
import { redirect } from "next/navigation";
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

function isEstateRole(value: unknown): value is EstateRole {
  return value === "OWNER" || value === "EDITOR" || value === "VIEWER";
}

function getRoleFromAccess(access: unknown): EstateRole {
  if (!access || typeof access !== "object") return "VIEWER";
  const role = (access as Record<string, unknown>).role;
  return isEstateRole(role) ? role : "VIEWER";
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const precision = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${n.toFixed(precision)} ${units[i]}`;
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
  fileName?: string;
  fileType?: string;
  fileSizeBytes?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
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

  const editAccess = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const editRole = getRoleFromAccess(editAccess);

  if (editRole === "VIEWER") {
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

  // Treat forbidden redirects as read-only mode (even if user is normally an EDITOR/OWNER)
  const isReadOnly = forbidden;

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

  let role: EstateRole = "VIEWER";

  try {
    const access = await requireEstateAccess({ estateId, userId: session.user.id });
    role = getRoleFromAccess(access);
  } catch {
    // If access resolution fails (missing estate access / auth mismatch), show a clear Unauthorized state.
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <span className="truncate text-rose-200">Unauthorized</span>
            </nav>
          }
          title="Unauthorized"
          description="You don’t have access to this estate (or your session expired)."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/app/estates"
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to estates
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-50">We can’t show this document.</p>
          <p className="mt-1 text-sm text-slate-300">
            If you think you should have access, ask an estate OWNER to add you as a collaborator.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/app/estates"
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Return to estates
            </Link>
            <Link
              href={`/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Re-authenticate
            </Link>
          </div>
        </section>
      </div>
    );
  }
  const canEdit = roleAtLeast(role, "EDITOR") && !isReadOnly;

  await connectToDatabase();

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
  })
    .lean<EstateDocumentLean | null>()
    .exec();

  if (!doc) {
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link href={`/app/estates/${estateId}`} className="text-slate-400 hover:text-slate-200 hover:underline">
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
              <span className="truncate text-rose-200">Not found</span>
            </nav>
          }
          title="Document not found"
          description="This document index entry doesn’t exist (or was removed)."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
                {role}
              </span>
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to documents
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-50">We couldn’t find this document.</p>
          <p className="mt-1 text-sm text-slate-300">It may have been deleted, or the link might be incorrect.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Return to documents
            </Link>
            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back to overview
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (doc.isSensitive && role === "VIEWER") {
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link href={`/app/estates/${estateId}`} className="text-slate-400 hover:text-slate-200 hover:underline">
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
              <span className="truncate text-rose-200">Restricted</span>
            </nav>
          }
          title="Restricted document"
          description="This document is marked sensitive. Viewer access can’t open sensitive entries."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
                {role}
              </span>
              <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-950/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
                Sensitive
              </span>
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to documents
              </Link>
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request access
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 shadow-sm">
          <p className="text-sm font-semibold text-amber-100">Access required</p>
          <p className="mt-1 text-sm text-amber-200/90">
            Ask the estate owner to grant you EDITOR access if you need to view sensitive document entries.
          </p>
        </section>
      </div>
    );
  }

  const tagsArray = Array.isArray(doc.tags) ? doc.tags : [];
  const docId = doc._id?.toString?.() ?? String(doc._id);
  const createdAtText = doc.createdAt ? new Date(doc.createdAt).toLocaleString() : "—";
  const updatedAtText = doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "—";
  const fileSizeText = formatBytes(doc.fileSizeBytes ?? null);

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link href={`/app/estates/${estateId}`} className="text-slate-400 hover:text-slate-200 hover:underline">
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
              {role}
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

            <Link
              href={`/app/estates/${estateId}/documents?${new URLSearchParams({
                subject: String(doc.subject ?? ""),
              }).toString()}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Subject index
            </Link>

            {canEdit && (
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
                : `Your role is ${role}. Ask an OWNER to grant EDITOR access if you need to make changes.`}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href={requestAccessHref}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
              >
                Request editor access
              </Link>
              <p className="text-[11px] text-amber-200/80">Tip: If you’re the OWNER, invite yourself from Collaborators.</p>
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subject</p>
                <p className="mt-1 text-sm font-medium text-slate-50">
                  {SUBJECT_LABELS[doc.subject] ?? doc.subject ?? "—"}
                </p>
              </div>

              <Link
                href={`/app/estates/${estateId}/documents?${new URLSearchParams({
                  subject: String(doc.subject ?? ""),
                }).toString()}`}
                className="mt-0.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
              >
                View all
              </Link>
            </div>
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

        {/* File metadata and record info */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">File</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{doc.fileName || "—"}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {doc.fileType || "—"} • {fileSizeText}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Record</p>
            <p className="mt-1 text-sm font-medium text-slate-50">{docId}</p>
            <p className="mt-0.5 text-xs text-slate-400">Created: {createdAtText}</p>
            <p className="mt-0.5 text-xs text-slate-400">Updated: {updatedAtText}</p>
          </div>
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tags</p>
              {tagsArray.length > 0 ? (
                <Link
                  href={`/app/estates/${estateId}/documents?${new URLSearchParams({
                    tag: String(tagsArray[0] ?? ""),
                  }).toString()}`}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                >
                  Filter index
                </Link>
              ) : canEdit ? (
                <Link
                  href={`/app/estates/${estateId}/documents/${documentId}/edit`}
                  className="text-[11px] font-semibold text-rose-200 hover:text-rose-100 underline-offset-2 hover:underline"
                >
                  Add tags
                </Link>
              ) : null}
            </div>

            {tagsArray.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tagsArray.map((t) => {
                  const normalized = String(t ?? "").trim();
                  const href = `/app/estates/${estateId}/documents?${new URLSearchParams({
                    tag: normalized,
                  }).toString()}`;

                  return (
                    <Link
                      key={normalized || t}
                      href={href}
                      className="inline-flex rounded-full border border-slate-700 bg-slate-900/40 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-900/60"
                      title={`Filter index by tag: ${normalized}`}
                    >
                      {normalized || "(tag)"}
                    </Link>
                  );
                })}
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

        {/* Raw record inspector */}
        <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Raw record
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
            {JSON.stringify(
              {
                ...doc,
                _id: docId,
              },
              null,
              2
            )}
          </pre>
        </details>

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
                I understand this will remove the document index entry for{" "}
                <span className="font-semibold">{doc.label || "this document"}</span>.
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Delete index entry
              </button>

              <p className="text-[11px] text-rose-200/70">Tip: if you only need to change label/subject, use Edit instead.</p>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}