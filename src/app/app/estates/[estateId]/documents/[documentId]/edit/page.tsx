import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EstateDocument } from "@/models/EstateDocument";
import { requireEstateAccess } from "@/lib/estateAccess";

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

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function roleAtLeast(role: EstateRole, min: EstateRole): boolean {
  const order: Record<EstateRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
  return order[role] >= order[min];
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
  const access = await requireEstateAccess({ estateId });
  const role = (access as { role: EstateRole | undefined }).role;

  if (!role || !roleAtLeast(role, "EDITOR")) {
    redirect(`/app/estates/${estateId}/documents/${documentId}?forbidden=1`);
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await EstateDocument.findOneAndUpdate(
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

  const access = await requireEstateAccess({ estateId });
  const role = (access as { role: EstateRole | undefined }).role;

  if (!role) {
    // No access to this estate
    notFound();
  }

  const isReadOnly = !roleAtLeast(role, "EDITOR");

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
  }).lean<EstateDocumentLean>();

  if (!doc) {
    notFound();
  }

  const tagsValue = Array.isArray(doc.tags) ? doc.tags.join(", ") : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            <span>Edit Document</span>
            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] tracking-normal text-slate-300">
              Role: {role}
            </span>
            {isReadOnly ? (
              <span className="rounded-full border border-rose-500/40 bg-rose-950/60 px-2 py-0.5 text-[10px] tracking-normal text-rose-200">
                View-only
              </span>
            ) : null}
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            {doc.label}
          </h1>
        </div>

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
      </div>

      {isReadOnly ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          <p className="font-medium">You have view-only access for this estate.</p>
          <p className="mt-1 text-xs text-rose-200/80">
            You can view document details, but editing is disabled. Ask the estate owner to upgrade your role to EDITOR if you need to make changes.
          </p>
        </div>
      ) : null}

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
              disabled={isReadOnly}
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
              disabled={isReadOnly}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            >
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
              disabled={isReadOnly}
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
              disabled={isReadOnly}
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
            disabled={isReadOnly}
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
            disabled={isReadOnly}
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
              disabled={isReadOnly}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
            />
            Mark as sensitive
          </label>

          <button
            type="submit"
            disabled={isReadOnly}
            className={
              isReadOnly
                ? "inline-flex cursor-not-allowed items-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-400"
                : "inline-flex items-center rounded-lg border border-emerald-500/60 bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/40 hover:bg-emerald-500"
            }
          >
            {isReadOnly ? "View-only" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}