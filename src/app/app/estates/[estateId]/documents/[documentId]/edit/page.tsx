import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import PageHeader from "@/components/layout/PageHeader";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EstateDocument } from "@/models/EstateDocument";
import { requireEstateEditAccess } from "@/lib/estateAccess";

interface PageProps {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
}

// Shape returned from Mongoose `.lean()`
interface EstateDocumentLean {
  _id: { toString(): string };
  estateId: string;
  ownerId: string;
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

async function updateDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") {
    return;
  }

  const label = formData.get("label")?.toString().trim();
  const subject = formData.get("subject")?.toString().trim();
  const location = formData.get("location")?.toString().trim() || "";
  const url = formData.get("url")?.toString().trim() || "";
  const tagsRaw = formData.get("tags")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";
  const isSensitive = formData.get("isSensitive") === "on";

  if (!label || !subject) {
    return;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}/edit`,
    );
  }

  await connectToDatabase();

  // Permission check (OWNER/EDITOR can edit)
  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const updated = await EstateDocument.findOneAndUpdate(
    {
      _id: documentId,
      estateId,
    },
    {
      label,
      subject,
      location,
      url,
      tags,
      notes,
      isSensitive,
    },
  );

  if (!updated) {
    redirect(`/app/estates/${estateId}/documents/${documentId}/edit?notFound=1`);
  }

  revalidatePath(`/app/estates/${estateId}/documents`);
  revalidatePath(`/app/estates/${estateId}/documents/${documentId}`);

  redirect(`/app/estates/${estateId}/documents/${documentId}`);
}

export default async function EditDocumentPage({ params }: PageProps) {
  const { estateId, documentId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}/edit`,
    );
  }

  await connectToDatabase();

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  const role = access.role;

  if (!role) {
    notFound();
  }

  if (role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
  }).lean<EstateDocumentLean>();

  if (!doc) {
    notFound();
  }

  const tagsValue = Array.isArray(doc.tags) ? doc.tags.join(", ") : "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <span>Edit Document</span>
            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
              Role: {role}
            </span>
          </div>
        }
        title={doc.label}
        description="Update label, subject, location, and notes."
        actions={
          <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
            <Link
              href={`/app/estates/${estateId}/documents/${documentId}`}
              className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
            >
              View
            </Link>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
            >
              Back to index
            </Link>
          </div>
        }
      />
      <form
        action={updateDocument}
        className="space-y-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-6"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="documentId" value={documentId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="label"
              className="text-xs font-medium text-slate-200"
            >
              Label
            </label>
            <input
              id="label"
              name="label"
              defaultValue={doc.label}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="subject"
              className="text-xs font-medium text-slate-200"
            >
              Subject
            </label>
            <select
              id="subject"
              name="subject"
              defaultValue={doc.subject}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            >
              {!Object.prototype.hasOwnProperty.call(SUBJECT_LABELS, doc.subject) ? (
                <option value={doc.subject}>{doc.subject}</option>
              ) : null}
              {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="location"
              className="text-xs font-medium text-slate-200"
            >
              Physical location
            </label>
            <input
              id="location"
              name="location"
              defaultValue={doc.location || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="url" className="text-xs font-medium text-slate-200">
              Online URL
            </label>
            <input
              id="url"
              name="url"
              type="url"
              placeholder="https://drive.google.com/..."
              defaultValue={doc.url || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tags" className="text-xs font-medium text-slate-200">
            Tags
            <span className="ml-1 text-[10px] font-normal text-slate-500">
              (comma-separated)
            </span>
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={tagsValue}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-xs font-medium text-slate-200">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={doc.notes || ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <p className="text-xs text-slate-500">
          Tip: Use clear labels (e.g., “Bank statements 2023 Q1–Q4”) so your final inventory/accounting is painless.
        </p>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
            <input
              type="checkbox"
              name="isSensitive"
              defaultChecked={Boolean(doc.isSensitive)}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
            />
            Mark as sensitive
          </label>

          <button
            type="submit"
            className="inline-flex items-center rounded-lg border border-emerald-500/60 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/40 hover:bg-emerald-500"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}