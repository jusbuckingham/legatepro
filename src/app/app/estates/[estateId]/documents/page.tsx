import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";

import { EstateDocument } from "@/models/EstateDocument";

interface EstateDocumentsPageProps {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/* -------------------- Types -------------------- */

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

/* -------------------- Server Actions -------------------- */

async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) return;

  const access = await requireEstateAccess({ estateId });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents?forbidden=1`);
  }

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/documents`);
}

/* -------------------- Page -------------------- */

export default async function EstateDocumentsPage({
  params,
  searchParams,
}: EstateDocumentsPageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents`);
  }

  const access = await requireEstateAccess({ estateId });
  const canEdit = access.role !== "VIEWER";
  const canViewSensitive = access.role !== "VIEWER";

  let searchQuery = "";
  let subjectFilter = "";
  let sensitiveOnly = false;

  if (searchParams) {
    const sp = await searchParams;

    const q = sp.q;
    const subject = sp.subject;
    const sensitive = sp.sensitive;

    searchQuery =
      typeof q === "string" ? q.trim() : Array.isArray(q) ? q[0] ?? "" : "";

    subjectFilter =
      typeof subject === "string"
        ? subject
        : Array.isArray(subject)
        ? subject[0] ?? ""
        : "";

    sensitiveOnly =
      sensitive === "1" ||
      sensitive === "true" ||
      sensitive === "on";
  }

  if (!canViewSensitive) {
    sensitiveOnly = false;
  }

  await connectToDatabase();

  const docs = await EstateDocument.find({ estateId })
    .sort({ subject: 1, label: 1 })
    .lean<EstateDocumentLean[]>();

  const documents: EstateDocumentItem[] = docs.map((doc) => ({
    _id: doc._id.toString(),
    subject: doc.subject,
    label: doc.label,
    location: doc.location || undefined,
    url: doc.url || undefined,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    notes: doc.notes || undefined,
    isSensitive: doc.isSensitive ?? false,
  }));

  const filteredDocuments = documents.filter((doc) => {
    if (subjectFilter && doc.subject !== subjectFilter) return false;
    if (!canViewSensitive && doc.isSensitive) return false;
    if (sensitiveOnly && !doc.isSensitive) return false;

    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return (
      doc.label.toLowerCase().includes(q) ||
      (doc.location ?? "").toLowerCase().includes(q) ||
      (doc.notes ?? "").toLowerCase().includes(q) ||
      doc.tags.join(" ").toLowerCase().includes(q)
    );
  });

  /* -------------------- JSX -------------------- */

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-50">
          Document index
        </h1>

        {canEdit ? (
          <a
            href="#add-document"
            className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase text-rose-100 hover:bg-rose-500/20"
          >
            Add document
          </a>
        ) : (
          <Link
            href={`/app/estates/${estateId}/documents?requestAccess=edit`}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold uppercase text-slate-200"
          >
            Request edit access
          </Link>
        )}
      </header>

      {/* Document Table */}
      {filteredDocuments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
          No documents found.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
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
              {filteredDocuments.map((doc) => (
                <tr
                  key={doc._id}
                  className="border-t border-slate-800 hover:bg-slate-900/60"
                >
                  <td className="px-3 py-2">
                    {SUBJECT_LABELS[doc.subject] ?? doc.subject}
                  </td>
                  <td className="px-3 py-2">{doc.label}</td>
                  <td className="px-3 py-2">{doc.location ?? "—"}</td>
                  <td className="px-3 py-2">
                    {doc.tags.length ? doc.tags.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        className="text-emerald-400 hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {doc.isSensitive ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/app/estates/${estateId}/documents/${doc._id}`}
                        className="text-slate-300 hover:underline"
                      >
                        View
                      </Link>

                      {canEdit ? (
                        <>
                          <Link
                            href={`/app/estates/${estateId}/documents/${doc._id}/edit`}
                            className="text-slate-300 hover:underline"
                          >
                            Edit
                          </Link>

                          <form action={deleteDocument}>
                            <input type="hidden" name="estateId" value={estateId} />
                            <input
                              type="hidden"
                              name="documentId"
                              value={doc._id}
                            />
                            <button className="text-rose-400 hover:underline">
                              Remove
                            </button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}