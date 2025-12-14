import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
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

// SERVER ACTION: update a document
async function updateDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const documentId = formData.get("documentId")?.toString();

  if (!estateId || !documentId) return;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app");
  }

  let access: { role: EstateRole };
  try {
    // `requireEstateAccess` derives the user from the current session and returns the resolved role.
    access = (await requireEstateAccess({ estateId })) as { role: EstateRole };
  } catch {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  if (!roleAtLeast(access.role, "EDITOR")) {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  const subject = formData.get("subject")?.toString().trim();
  const label = formData.get("label")?.toString().trim();
  const location = formData.get("location")?.toString().trim() || "";
  const url = formData.get("url")?.toString().trim() || "";
  const tagsRaw = formData.get("tags")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";
  const isSensitive = formData.get("isSensitive") === "on";

  if (!subject || !label) {
    redirect(`/app/estates/${estateId}/documents/${documentId}`);
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await connectToDatabase();

  await EstateDocument.findOneAndUpdate(
    {
      _id: documentId,
      estateId,
    },
    {
      subject,
      label,
      location,
      url,
      tags,
      notes,
      isSensitive,
    },
    { new: true },
  );

  revalidatePath(`/app/estates/${estateId}/documents`);
  redirect(`/app/estates/${estateId}/documents`);
}

// SERVER ACTION: delete from detail page
async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const documentId = formData.get("documentId")?.toString();

  if (!estateId || !documentId) return;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app");
  }

  let access: { role: EstateRole };
  try {
    access = (await requireEstateAccess({ estateId })) as { role: EstateRole };
  } catch {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  if (!roleAtLeast(access.role, "EDITOR")) {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/documents`);
  redirect(`/app/estates/${estateId}/documents`);
}

export default async function EstateDocumentDetailPage({ params, searchParams }: PageProps) {
  const { estateId, documentId } = await params;

  // Optional banner trigger when we redirect viewers away from edit actions
  let forbidden = false;
  if (searchParams) {
    const sp = await searchParams;
    const raw = sp.forbidden;
    const val = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    forbidden = val === "1" || val?.toLowerCase() === "true";
  }

  const requestAccessHref = `/app/estates/${estateId}/collaborators?request=EDITOR&from=document&documentId=${documentId}`;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`);
  }

  const access = (await requireEstateAccess({ estateId })) as { role: EstateRole };
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
  const tagsDefault = tagsArray.join(", ");

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb / header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-500 hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-300 hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-slate-300 hover:underline"
            >
              Document index
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="truncate text-rose-300">{doc.label || "Document"}</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              {canEdit ? "Edit document" : "Document details"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              {canEdit
                ? "Update how this document is indexed for the estate. You can refine the subject, label, location, tags, and notes without touching the underlying file."
                : "View how this document is indexed for the estate. You don’t have permission to edit this entry."}
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-end gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
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
          </div>
          <Link
            href={`/app/estates/${estateId}/documents`}
            className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60 md:hidden"
          >
            Back
          </Link>
          {(!canEdit || forbidden) && (
            <Link
              href={requestAccessHref}
              className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
            >
              Request access
            </Link>
          )}
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20"
            >
              Open linked file
            </a>
          )}
          <span className="text-[11px] text-slate-500">
            Make sure this index always reflects where the real document lives.
          </span>
        </div>
      </div>

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

      {/* Edit form */}
      <section
        className={`space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm ${
          canEdit ? "" : "opacity-90"
        }`}
      >
        <form action={updateDocument} className="space-y-4">
          <input type="hidden" name="estateId" value={estateId} />
          <input type="hidden" name="documentId" value={documentId} />

          {/* Subject + Location */}
          <div className="grid gap-3 md:grid-cols-[1.1fr,1.1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Subject
              </label>
              <select
                name="subject"
                required
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                defaultValue={doc.subject}
                disabled={!canEdit}
              >
                <option value="" disabled>
                  Select a subject
                </option>
                {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Location
              </label>
              <input
                name="location"
                defaultValue={doc.location || ""}
                placeholder="Google Drive, Dropbox, file cabinet…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">
              Document label
            </label>
            <input
              name="label"
              required
              defaultValue={doc.label}
              placeholder="e.g. Chase checking statements 2022–2023"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              disabled={!canEdit}
            />
          </div>

          {/* URL + Tags */}
          <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Link / URL (optional)
              </label>
              <input
                name="url"
                type="url"
                defaultValue={doc.url || ""}
                placeholder="https://drive.google.com/..."
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Tags (comma-separated)
              </label>
              <input
                name="tags"
                defaultValue={tagsDefault}
                placeholder="e.g. Chase, statements"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={doc.notes || ""}
              placeholder="Any additional notes…"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              disabled={!canEdit}
            />
          </div>

          {/* Sensitive + Actions */}
          <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                name="isSensitive"
                defaultChecked={!!doc.isSensitive}
                className="h-3 w-3"
                disabled={!canEdit}
              />
              Mark as sensitive
            </label>

            <div className="flex items-center gap-3">
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
              >
                Back to index
              </Link>

              {canEdit ? (
                <button
                  type="submit"
                  className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
                >
                  Save changes
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-400"
                  title="You don’t have permission to edit this entry"
                >
                  Save changes
                </button>
              )}
            </div>
          </div>
        </form>
      </section>

      {/* Danger zone: delete */}
      {canEdit && (
        <section className="rounded-xl border border-rose-900/60 bg-slate-950/80 p-4 text-xs text-rose-100">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-rose-300">
                Danger zone
              </h2>
              <p className="mt-1 text-[11px] text-rose-200/80">
                Removing this entry only deletes the index record in LegatePro. It does not
                delete the underlying file in Google Drive, Dropbox, or your physical files.
              </p>
            </div>

            <form action={deleteDocument}>
              <input type="hidden" name="estateId" value={estateId} />
              <input type="hidden" name="documentId" value={documentId} />
              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/70 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20 md:mt-0"
              >
                Delete index entry
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}