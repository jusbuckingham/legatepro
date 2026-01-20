import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

import PageHeader from "@/components/layout/PageHeader";

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

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function buildDocumentsUrl(
  estateId: string,
  params: { q?: string; subject?: string; sensitive?: boolean; tag?: string }
): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.subject) sp.set("subject", params.subject);
  if (params.sensitive) sp.set("sensitive", "1");
  if (params.tag) sp.set("tag", params.tag);
  const qs = sp.toString();
  return `/app/estates/${encodeURIComponent(estateId)}/documents${qs ? `?${qs}` : ""}`;
}

export const dynamic = "force-dynamic";

async function getBaseUrl(): Promise<string> {
  // Prefer explicit env var for predictable behavior in server actions.
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // Fall back to request headers (works on Vercel / reverse proxies).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;

  // Final fallback for local dev.
  return "http://localhost:3000";
}

/* -------------------- Server Actions -------------------- */

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
    redirect(`/login?callbackUrl=/app/estates/${encodeURIComponent(estateId)}/documents`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents?forbidden=1`);
  }

  const tags = Array.from(
    new Set(
      tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase())
    )
  );
  
  const res = await fetch(
    `${await getBaseUrl()}/api/estates/${encodeURIComponent(estateId)}/documents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        subject,
        location,
        url,
        tags,
        notes,
        isSensitive,
      }),
    }
  );

  if (!res.ok) {
    redirect(`/app/estates/${estateId}/documents?error=create_failed`);
  }

  redirect(`/app/estates/${estateId}/documents`);
}

async function deleteDocument(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const documentId = formData.get("documentId");

  if (typeof estateId !== "string" || typeof documentId !== "string") return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${encodeURIComponent(estateId)}/documents`);
  }

  const access = await requireEstateEditAccess({ estateId, userId: session.user.id });
  if (access.role === "VIEWER") {
    redirect(`/app/estates/${estateId}/documents?forbidden=1`);
  }

  const res = await fetch(
    `${await getBaseUrl()}/api/estates/${encodeURIComponent(estateId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    redirect(`/app/estates/${estateId}/documents?error=delete_failed`);
  }

  revalidatePath(`/app/estates/${estateId}/documents`);
  redirect(`/app/estates/${estateId}/documents`);
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

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";
  const canViewSensitive = access.role !== "VIEWER";
  const canCreate = canEdit;

  let searchQuery = "";
  let subjectFilter = "";
  let tagFilter = "";
  let sensitiveOnly = false;

  const sp = searchParams ? await searchParams : undefined;

  if (sp) {
    const q = firstParam(sp.q).trim();
    const subject = firstParam(sp.subject);
    const tag = firstParam(sp.tag).trim();
    const sensitive = firstParam(sp.sensitive);

    searchQuery = q;
    subjectFilter = subject;
    tagFilter = tag;

    sensitiveOnly = sensitive === "1" || sensitive === "true" || sensitive === "on";
  }

  const forbidden = firstParam(sp?.forbidden) === "1";

  if (!canViewSensitive) {
    sensitiveOnly = false;
  }

  const apiUrl = new URL(
    `/api/estates/${encodeURIComponent(estateId)}/documents`,
    await getBaseUrl(),
  );

  if (searchQuery) apiUrl.searchParams.set("q", searchQuery);
  if (subjectFilter) apiUrl.searchParams.set("subject", subjectFilter);
  if (tagFilter) apiUrl.searchParams.set("tag", tagFilter);
  if (canViewSensitive && sensitiveOnly) apiUrl.searchParams.set("sensitive", "1");

  const res = await fetch(apiUrl.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  let data: { ok: boolean; documents?: EstateDocumentLean[]; error?: string } = { ok: false };
  try {
    data = (await res.json()) as { ok: boolean; documents?: EstateDocumentLean[]; error?: string };
  } catch {
    // Ignore JSON parse errors; `data.ok` will remain false.
  }

  const docs = res.ok && data.ok && Array.isArray(data.documents) ? data.documents : [];

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

  // Since API filters, what we have is already filtered
  const filteredDocuments = documents;

  const availableTags = Array.from(
    new Set(
      documents
        .flatMap((d) => d.tags ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const topTags = Array.from(
    documents
      .flatMap((d) => d.tags ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .reduce<Map<string, number>>((acc, t) => {
        const key = t.toLowerCase();
        acc.set(key, (acc.get(key) ?? 0) + 1);
        return acc;
      }, new Map())
      .entries()
  )
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  /* -------------------- JSX -------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="text-slate-400 hover:text-slate-200">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="text-slate-300 hover:text-slate-100"
            >
              Estate
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Document index</span>
          </nav>
        }
        title="Document index"
        description="Keep a clean, court-ready index of every important document for this estate—where it lives, what it covers, and how to find it again in seconds."
        actions={
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
              Court packet helper
            </span>
            <span className="text-[11px] text-slate-500">
              Use this index when assembling your final inventory or accounting.
            </span>

            {canCreate ? (
              <Link
                href="#add-document"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
              >
                Add document
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}/documents?requestAccess=edit`}
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/40"
              >
                Request edit access
              </Link>
            )}
          </div>
        }
      />

      {forbidden && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to add, edit, or remove documents.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view the document index, but you can’t add, edit, or remove entries.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
          Total: <span className="ml-1 text-slate-200">{documents.length}</span>
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
          Showing: <span className="ml-1 text-slate-200">{filteredDocuments.length}</span>
        </span>
        {canViewSensitive ? (
          <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
            Sensitive:{" "}
            <span className="ml-1 text-slate-200">
              {documents.filter((d) => d.isSensitive).length}
            </span>
          </span>
        ) : null}
      </div>

      {topTags.length > 0 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Top tags
            </div>
            {tagFilter ? (
              <Link
                href={buildDocumentsUrl(estateId, {
                  q: searchQuery || undefined,
                  subject: subjectFilter || undefined,
                  sensitive: sensitiveOnly,
                  tag: "",
                })}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear tag
              </Link>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {topTags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={buildDocumentsUrl(estateId, {
                  q: searchQuery || undefined,
                  subject: subjectFilter || undefined,
                  sensitive: sensitiveOnly,
                  tag,
                })}
                className={
                  tagFilter && tag.toLowerCase() === tagFilter.toLowerCase()
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
                    : "inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                }
                title={`Filter by tag: ${tag}`}
              >
                <span>{tag}</span>
                <span className="text-slate-400">({count})</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* New document entry form */}
      {canCreate ? (
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

            <div className="grid gap-3 md:grid-cols-[1.1fr,1.1fr]">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Subject</label>
                <select
                  name="subject"
                  required
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                  defaultValue=""
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
                <label className="text-xs font-medium text-slate-200">Location</label>
                <input
                  name="location"
                  placeholder="Google Drive, Dropbox, file cabinet…"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Document label</label>
              <input
                name="label"
                required
                placeholder="e.g. Chase checking statements 2022–2023"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              />
            </div>

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

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">Notes</label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Any additional notes…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50"
              />
            </div>

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
      ) : null}

      {/* Filters */}
      {documents.length > 0 ? (
        <form
          method="GET"
          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="q" className="whitespace-nowrap text-[11px] text-slate-400">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Label, location, tags, notes…"
              className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50 placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <div className="flex items-center gap-2 md:w-64">
              <label htmlFor="subject" className="whitespace-nowrap text-[11px] text-slate-400">
                Subject
              </label>
              <select
                id="subject"
                name="subject"
                defaultValue={subjectFilter}
                className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50"
              >
                <option value="">All subjects</option>
                {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {availableTags.length > 0 ? (
              <div className="flex items-center gap-2 md:w-56">
                <label htmlFor="tag" className="whitespace-nowrap text-[11px] text-slate-400">
                  Tag
                </label>
                <select
                  id="tag"
                  name="tag"
                  defaultValue={tagFilter}
                  className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50"
                >
                  <option value="">All tags</option>
                  {availableTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {canViewSensitive ? (
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  name="sensitive"
                  value="1"
                  defaultChecked={sensitiveOnly}
                  className="h-3 w-3"
                />
                Sensitive only
              </label>
            ) : null}

            {(!!searchQuery || !!subjectFilter || !!tagFilter || sensitiveOnly) ? (
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="whitespace-nowrap text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* Document index */}
      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-6">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-slate-100">No documents indexed yet</div>
            <div className="mt-1 text-xs text-slate-400">
              Add a few key items first: death certificate, court letters, bank statements, and any property documents.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {canCreate ? (
                <Link
                  href="#add-document"
                  className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-rose-400"
                >
                  Add first document
                </Link>
              ) : (
                <Link
                  href={`/app/estates/${estateId}?requestAccess=1`}
                  className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
                >
                  Request edit access
                </Link>
              )}

              <Link
                href={`/app/estates/${estateId}`}
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
              >
                Back to overview
              </Link>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Tip: use consistent labels (vendor + date range) so your final accounting is faster.
            </div>
          </div>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-6">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-slate-100">No matching documents</div>
            <div className="mt-1 text-xs text-slate-400">
              Try adjusting your search, subject, or sensitivity filter.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/app/estates/${estateId}/documents`}
                className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/40"
              >
                Clear filters
              </Link>
              <Link
                href="#add-document"
                className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
              >
                Add a document
              </Link>
            </div>
          </div>
        </div>
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
              {filteredDocuments.map((doc) => {
                const tags = doc.tags ?? [];

                return (
                  <tr
                    key={doc._id}
                    className="border-t border-slate-800 bg-slate-950/40 hover:bg-slate-900/60"
                  >
                    <td className="px-3 py-2 text-slate-200">
                      {SUBJECT_LABELS[doc.subject] ?? doc.subject}
                    </td>
                    <td className="px-3 py-2 text-slate-100">
                      <Link
                        href={`/app/estates/${estateId}/documents/${doc._id}`}
                        className="hover:text-emerald-300 underline-offset-2 hover:underline"
                      >
                        {doc.label}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{doc.location || "—"}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {tags.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <Link
                              key={tag}
                              href={buildDocumentsUrl(estateId, {
                                q: searchQuery || undefined,
                                subject: subjectFilter || undefined,
                                sensitive: sensitiveOnly,
                                tag,
                              })}
                              className={
                                tagFilter && tag.toLowerCase() === tagFilter.toLowerCase()
                                  ? "inline-flex rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
                                  : "inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                              }
                              title={`Filter by tag: ${tag}`}
                            >
                              {tag}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
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
                          View
                        </Link>

                        {canEdit ? (
                          <>
                            <Link
                              href={`/app/estates/${estateId}/documents/${doc._id}/edit`}
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
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}