import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { connectToDatabase } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EstateDocument } from "@/models/EstateDocument";

interface PageProps {
  params: Promise<{
    estateId: string;
    documentId: string;
  }>;
}

// 🔴 Server action to delete a document
async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") {
    return;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`,
    );
  }

  await connectToDatabase();

  await EstateDocument.findOneAndDelete({
    _id: documentId,
    estateId,
    ownerId: session!.user!.id,
  });

  redirect(`/app/estates/${estateId}/documents`);
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { estateId, documentId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/documents/${documentId}`);
  }

  await connectToDatabase();

  const doc = await EstateDocument.findOne({
    _id: documentId,
    estateId,
    ownerId: session!.user!.id,
  }).lean();

  if (!doc) {
    notFound();
  }

  const createdAt = doc.createdAt
    ? new Date(doc.createdAt).toLocaleString()
    : "";
  const updatedAt = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleString()
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Document
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            {doc.label}
          </h1>
          <p className="text-xs text-slate-400">
            Added {createdAt}
            {updatedAt && createdAt !== updatedAt
              ? ` · Updated ${updatedAt}`
              : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
          <Link
            href={`/app/estates/${estateId}/documents`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to documents
          </Link>

          <Link
            href={`/app/estates/${estateId}/documents/${documentId}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm shadow-black/40 hover:bg-slate-800"
          >
            Edit
          </Link>

          {/* 🔴 Delete button wired to server action */}
          <form action={deleteDocument} className="inline-flex">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="documentId" value={documentId} />
            <button
              type="submit"
              className="inline-flex items-center rounded-lg border border-red-500/70 bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-100 shadow-sm shadow-black/40 hover:bg-red-700/70"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Details</h2>
          <dl className="grid grid-cols-1 gap-3 text-xs text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Subject</dt>
              <dd className="font-medium">{doc.subject}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sensitive</dt>
              <dd className="font-medium">{doc.isSensitive ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Physical location</dt>
              <dd className="font-medium">{doc.location || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Online URL</dt>
              <dd className="font-medium">
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    Open document
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <div className="space-y-2 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notes
            </h3>
            <p className="whitespace-pre-wrap text-sm text-slate-200">
              {doc.notes || "No notes added yet."}
            </p>
          </div>
        </section>

        <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Tags & metadata
          </h2>
          <div className="space-y-3 text-xs text-slate-300">
            <div>
              <p className="text-slate-500">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {doc.tags && doc.tags.length > 0 ? (
                  doc.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-200"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500">No tags</span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
              <p>Document ID: {documentId}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}