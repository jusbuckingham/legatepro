// src/app/app/estates/[estateId]/documents/[documentId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "../../../../../../lib/db";
import { EstateDocument } from "../../../../../../models/EstateDocument";

interface PageProps {
  params: {
    estateId: string;
    documentId: string;
  };
}

interface EstateDocumentDoc {
  _id: unknown;
  estateId: unknown;
  subject: string;
  label: string;
  location?: string;
  url?: string;
  tags?: string[];
  notes?: string;
  isSensitive?: boolean;
}

async function loadDocument(
  estateId: string,
  documentId: string
): Promise<EstateDocumentDoc | null> {
  await connectToDatabase();

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
  }).lean<EstateDocumentDoc | null>();

  return doc;
}

async function updateDocument(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") {
    return;
  }

  const subject = formData.get("subject")?.toString().trim() ?? "";
  const label = formData.get("label")?.toString().trim() ?? "";
  const location = formData.get("location")?.toString().trim() || "";
  const url = formData.get("url")?.toString().trim() || "";
  const tagsRaw = formData.get("tags")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";
  const isSensitive = formData.get("isSensitive") === "on";

  if (!subject || !label) {
    // Require minimum structure; silently ignore invalid submissions
    return;
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await connectToDatabase();

  await EstateDocument.findOneAndUpdate(
    { _id: documentId, estateId },
    {
      subject,
      label,
      location: location || undefined,
      url: url || undefined,
      tags,
      notes: notes || undefined,
      isSensitive,
    },
    { new: true }
  );

  revalidatePath(`/app/estates/${estateId}/documents`);
  redirect(`/app/estates/${estateId}/documents`);
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { estateId, documentId } = params;

  if (!estateId || !documentId) {
    notFound();
  }

  const doc = await loadDocument(estateId, documentId);

  if (!doc) {
    notFound();
  }

  const subject = doc.subject ?? "";
  const label = doc.label ?? "";
  const location = doc.location ?? "";
  const url = doc.url ?? "";
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  const notes = doc.notes ?? "";
  const isSensitive = Boolean(doc.isSensitive);

  const displayTitle = label || subject || "Document entry";

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Current estate</span>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
            >
              Document index
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Edit</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Edit document index entry
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Update how this document is described and where it&apos;s stored.
              LegatePro keeps a court-ready index of documents—it doesn&apos;t move
              or upload the files themselves.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            You can use this index later when assembling your inventory, tax
            package, or final accounting.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Court packet helper
          </span>
          {isSensitive && (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-950/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-100">
              Marked as sensitive
            </span>
          )}
          <Link
            href={`/app/estates/${estateId}/documents`}
            className="mt-1 text-[11px] text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Back to document index
          </Link>
        </div>
      </div>

      {/* Edit form */}
      <form
        action={updateDocument}
        className="max-w-3xl space-y-4 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="documentId" value={documentId} />

        <div className="mb-1 text-xs text-slate-500">
          Editing:{" "}
          <span className="font-medium text-slate-200">
            {displayTitle}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.1fr,1.1fr]">
          <div className="space-y-1">
            <label
              htmlFor="subject"
              className="text-xs font-medium text-slate-200"
            >
              Subject / category
            </label>
            <input
              id="subject"
              name="subject"
              defaultValue={subject}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="e.g. Banking, Auto, Medical, Income tax, Property"
            />
            <p className="text-[11px] text-slate-500">
              This is the broad bucket the document belongs to (Banking, Auto,
              Medical, Taxes, Insurance, etc.).
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="location"
              className="text-xs font-medium text-slate-200"
            >
              Location (where it&apos;s stored)
            </label>
            <input
              id="location"
              name="location"
              defaultValue={location}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="e.g. Google Drive, iCloud, Dropbox, physical folder"
            />
            <p className="text-[11px] text-slate-500">
              Be specific enough that someone else could find it without asking
              you.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="label"
            className="text-xs font-medium text-slate-200"
          >
            Document label
          </label>
          <input
            id="label"
            name="label"
            defaultValue={label}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="e.g. Chase checking 1234 statements 2022–2023"
          />
          <p className="text-[11px] text-slate-500">
            Think of this as the exact line that would appear on a court-ready
            index or inventory.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
          <div className="space-y-1">
            <label
              htmlFor="url"
              className="text-xs font-medium text-slate-200"
            >
              Link / URL (optional)
            </label>
            <input
              id="url"
              name="url"
              type="url"
              defaultValue={url}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="https://drive.google.com/..."
            />
            <p className="text-[11px] text-slate-500">
              Paste a direct link if the document lives in cloud storage.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="tags"
              className="text-xs font-medium text-slate-200"
            >
              Tags (comma-separated, optional)
            </label>
            <input
              id="tags"
              name="tags"
              defaultValue={tags.join(", ")}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="e.g. Chase, statements, banking"
            />
            <p className="text-[11px] text-slate-500">
              Short keywords that make this entry easy to search.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="notes"
            className="text-xs font-medium text-slate-200"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={notes}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="e.g. Includes 1099s, last year's return, copies of correspondence."
          />
          <p className="text-[11px] text-slate-500">
            Anything future-you (or your attorney) would want to remember about
            this document.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              name="isSensitive"
              defaultChecked={isSensitive}
              className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-rose-500 focus:ring-rose-500"
            />
            Mark as sensitive (identity, SSN, tax IDs, etc.)
          </label>

          <div className="flex items-center gap-3">
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-[11px] text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
