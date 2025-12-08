import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EstateDocument } from "@/models/EstateDocument";

interface EstateDocumentsPageProps {
  params: Promise<{
    estateId: string;
  }>;
}

// Shape returned from Mongoose `.lean()`
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

// Shape used within this page
interface EstateDocumentItem {
  _id: string;
  subject: string;
  label: string;
  location?: string;
  url?: string;
  tags: string[];
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

export const dynamic = "force-dynamic";

async function createDocumentEntry(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const subject = formData.get("subject")?.toString().trim();
  const location = formData.get("location")?.toString().trim() || "";
  const label = formData.get("label")?.toString().trim();
  const url = formData.get("url")?.toString().trim() || "";
  const tagsRaw = formData.get("tags")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";
  const isSensitive = formData.get("isSensitive") === "on";

  if (!estateId || !subject || !label) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app");
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await connectToDatabase();

  await EstateDocument.create({
    estateId,
    subject,
    location,
    label,
    url,
    tags,
    notes,
    isSensitive,
    ownerId: session.user.id,
  });

  redirect(`/app/estates/${estateId}/documents`);
}

async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) return;

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
    ownerId: session.user.id,
  });

  revalidatePath(`/app/estates/${estateId}/documents`);
}

export default async function EstateDocumentsPage({
  params,
}: EstateDocumentsPageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents`);
  }

  await connectToDatabase();

  const docs = await EstateDocument.find({
    estateId,
    ownerId: session.user.id,
  })
    .sort({ subject: 1, label: 1 })
    .lean<EstateDocumentLean[]>();

  const documents: EstateDocumentItem[] = (docs ?? []).map((doc) => ({
    _id: doc._id.toString(),
    subject: doc.subject,
    label: doc.label,
    location: doc.location || undefined,
    url: doc.url || undefined,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    notes: doc.notes || undefined,
    isSensitive: doc.isSensitive ?? false,
  }));

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
            <span className="text-rose-300">Document index</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Document index
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Keep a clean, court-ready index of every important document for this
              estate—where it lives, what it covers, and how to find it again in seconds.
            </p>
          </div>
        </div>

        {/* RIGHT SIDE WITH THE ADD BUTTON */}
        <div className="mt-1 flex flex-col items-end gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Court packet helper
          </span>
          <span className="text-[11px] text-slate-500">
            Use this index when assembling your final inventory or accounting.
          </span>

          {/* Add Document Button */}
          <a
            href="#add-document"
            className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
          >
            Add document
          </a>
        </div>
      </div>

      {/* New document entry form */}
      <section
        id="add-document"
        className="space-y-3 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Add a document to the index
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              You’re not uploading files here—just keeping a precise record of where each document lives.
            </p>
          </div>
          <p className="hidden text-[11px] text-slate-500 md:block">
            Tip: group by subject to keep things scannable.
          </p>
        </div>

        <form action={createDocumentEntry} className="space-y-3 pt-1">
          <input type="hidden" name="estateId" value={estateId} />

          {/* Subject + Location */}
          <div className="grid gap-3 md:grid-cols-[1.1fr,1.1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Subject</label>
              <select
                name="subject"
                required
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                defaultValue=""
              >
                <option value="" disabled>Select a subject</option>
                {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Location</label>
              <input
                name="location"
                placeholder="Google Drive, Dropbox, file cabinet…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              />
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">Document label</label>
            <input
              name="label"
              required
              placeholder="e.g. Chase checking statements 2022–2023"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
            />
          </div>

          {/* URL + Tags */}
          <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Link / URL (optional)</label>
              <input
                name="url"
                type="url"
                placeholder="https://drive.google.com/..."
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Tags (comma-separated)</label>
              <input
                name="tags"
                placeholder="e.g. Chase, statements"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Any additional notes…"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
            />
          </div>

          {/* Sensitive + Submit */}
          <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" name="isSensitive" className="h-3 w-3" />
              Mark as sensitive
            </label>

            <button
              type="submit"
              className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
            >
              Add to index
            </button>
          </div>
        </form>
      </section>

      {/* Document index */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Indexed documents
          </h2>
          {documents.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Use this table when preparing your court packet.
            </p>
          )}
        </div>

        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
            No documents indexed yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Tags</th>
                  <th className="px-3 py-2">Link</th>
                  <th className="px-3 py-2">Sensitive</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const tags = doc.tags ?? [];

                  return (
                    <tr
                      key={doc._id}
                      className="border-t border-slate-800 bg-slate-950/40 hover:bg-slate-900/60"
                    >
                      <td className="px-3 py-2 text-slate-200">
                        {SUBJECT_LABELS[doc.subject] ?? doc.subject}
                      </td>
                      <td className="px-3 py-2 text-slate-100">{doc.label}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {doc.location || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {tags.length === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] lowercase text-slate-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {doc.isSensitive ? (
                          <span className="inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-200">
                            Sensitive
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] uppercase text-slate-300">
                            Standard
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          <Link
                            href={`/app/estates/${estateId}/documents/${doc._id}`}
                            className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={deleteDocument}>
                            <input type="hidden" name="estateId" value={estateId} />
                            <input type="hidden" name="documentId" value={doc._id} />
                            <button
                              type="submit"
                              className="text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline"
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}