import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { EstateDocument } from "@/models/EstateDocument";

export const dynamic = "force-dynamic";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

type RequireEstateAccessArgs = {
  estateId: string;
  minRole: EstateRole;
};

type EstateAccessResult = {
  role: EstateRole;
};

async function requireEstateAccess(
  args: RequireEstateAccessArgs,
): Promise<EstateAccessResult> {
  const mod = (await import("@/lib/estateAccess")) as unknown;

  // Support either:
  //  - export async function requireEstateAccess(...) {}
  //  - export default async function requireEstateAccess(...) {}
  const fn =
    (typeof (mod as { requireEstateAccess?: unknown }).requireEstateAccess ===
    "function"
      ? (mod as { requireEstateAccess: (a: RequireEstateAccessArgs) => Promise<EstateAccessResult> })
          .requireEstateAccess
      : typeof (mod as { default?: unknown }).default === "function"
      ? (mod as { default: (a: RequireEstateAccessArgs) => Promise<EstateAccessResult> }).default
      : null);

  if (!fn) {
    throw new Error(
      "Estate access helper not found. Export requireEstateAccess (named or default) from src/lib/estateAccess.ts",
    );
  }

  return fn(args);
}

type PageProps = {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
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

  await requireEstateAccess({ estateId, minRole: "EDITOR" });

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

  await requireEstateAccess({ estateId, minRole: "EDITOR" });

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/documents`);
  redirect(`/app/estates/${estateId}/documents`);
}

export default async function EstateDocumentDetailPage({ params }: PageProps) {
  const { estateId, documentId } = await params;

  const access = await requireEstateAccess({ estateId, minRole: "VIEWER" });
  const canEdit = access.role === "OWNER" || access.role === "EDITOR";

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
            <Link href="/app/estates" className="hover:underline text-slate-500">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="hover:underline text-slate-300"
            >
              Document index
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300 truncate">
              {doc.label || "Document"}
            </span>
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
                Cancel
              </Link>
              {canEdit && (
                <button
                  type="submit"
                  className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
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