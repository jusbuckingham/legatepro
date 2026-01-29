import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { EstateProperty } from "@/models/EstateProperty";

export const metadata = {
  title: "Property Documents | LegatePro",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeExternalUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) return null;

  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function getBaseUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

function firstParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

interface PropertyDocumentsPageProps {
  params: Promise<{
    estateId: string;
    propertyId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface PropertyItem {
  _id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface DocumentItem {
  _id: string;
  subject: string;
  label: string;
  location?: string;
  url?: string;
  tags: string[];
  notes?: string;
  isSensitive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
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

function normalizeTag(tag: string): string {
  return (tag ?? "").trim().toLowerCase();
}


function formatDate(value?: string | Date) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatAddress(p: PropertyItem): string {
  const addressLine = [p.address, p.postalCode].filter(Boolean).join(" ").trim();
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  return [addressLine, cityState, p.country].filter(Boolean).join(" · ");
}

export default async function PropertyDocumentsPage({
  params,
  searchParams,
}: PropertyDocumentsPageProps) {
  const { estateId, propertyId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const q = firstParam(sp?.q).trim();
  const subjectFilter = firstParam(sp?.subject).trim();
  const tagFilter = firstParam(sp?.tag).trim();
  const sensitiveOnly = firstParam(sp?.sensitive) === "1";
  const hasUrlOnly = firstParam(sp?.hasUrl) === "1";
  const forbiddenFlag = firstParam(sp?.forbidden) === "1";

  const hasFilters = Boolean(q || subjectFilter || tagFilter || sensitiveOnly || hasUrlOnly);

  if (!estateId || !propertyId) {
    notFound();
  }

  const tag = normalizeTag(`property:${propertyId}`);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/app/estates/${estateId}/properties/${propertyId}/documents`,
      )}`,
    );
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  const canEdit = role !== "VIEWER";
  const canViewSensitive = role !== "VIEWER";

  await connectToDatabase();

  // Fetch property info
  type PropertyLean = {
    _id: unknown;
    name?: unknown;
    address?: unknown;
    city?: unknown;
    state?: unknown;
    postalCode?: unknown;
    country?: unknown;
  };

  const property = (await EstateProperty.findOne({
    _id: propertyId,
    $or: [{ estateId }, { estate: estateId }],
  })
    .lean()
    .exec()) as PropertyLean | null;

  if (!property?._id) notFound();

  const propertyItem: PropertyItem = {
    _id: String(property._id),
    name: typeof property.name === "string" ? property.name : undefined,
    address: typeof property.address === "string" ? property.address : undefined,
    city: typeof property.city === "string" ? property.city : undefined,
    state: typeof property.state === "string" ? property.state : undefined,
    postalCode: typeof property.postalCode === "string" ? property.postalCode : undefined,
    country: typeof property.country === "string" ? property.country : undefined,
  };

  const baseUrl = await getBaseUrl();
  const apiUrl = new URL(
    `/api/estates/${encodeURIComponent(estateId)}/documents`,
    baseUrl,
  );

  apiUrl.searchParams.set("tag", tag);
  if (q) apiUrl.searchParams.set("q", q);
  if (subjectFilter) apiUrl.searchParams.set("subject", subjectFilter);
  if (canViewSensitive && sensitiveOnly) apiUrl.searchParams.set("sensitive", "1");

  const res = await fetch(apiUrl.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  type ApiDocument = {
    _id?: unknown;
    subject?: unknown;
    label?: unknown;
    location?: unknown;
    url?: unknown;
    tags?: unknown;
    notes?: unknown;
    isSensitive?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  let data: { ok: boolean; documents?: unknown[] } = { ok: false };
  try {
    data = (await res.json()) as { ok: boolean; documents?: unknown[] };
  } catch {
    // ignore
  }

  const docs: ApiDocument[] =
    res.ok && data.ok && Array.isArray(data.documents)
      ? (data.documents as ApiDocument[])
      : [];

  const documents: DocumentItem[] = docs.map((doc) => {
    const tagsRaw = doc.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw
          .map((t: unknown) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
          .filter(Boolean)
      : [];

    return {
      _id: doc._id != null ? String(doc._id) : "",
      subject: typeof doc.subject === "string" ? doc.subject : "",
      label: typeof doc.label === "string" ? doc.label : "",
      location: typeof doc.location === "string" ? doc.location : undefined,
      url: typeof doc.url === "string" ? doc.url : undefined,
      tags,
      notes: typeof doc.notes === "string" ? doc.notes : undefined,
      isSensitive: Boolean(doc.isSensitive),
      createdAt: (doc.createdAt as string | Date | undefined) ?? undefined,
      updatedAt: (doc.updatedAt as string | Date | undefined) ?? undefined,
    };
  });

  const hasDocs = documents.length > 0;

  const subjects = Array.from(
    new Set(
      documents
        .map((d) => (d.subject ?? "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    ),
  );

  const filteredDocs = documents.filter((d) => (hasUrlOnly ? Boolean(d.url) : true));
  const hasFilteredDocs = filteredDocs.length > 0;

  const addressDisplay = formatAddress(propertyItem);

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500">
        <Link
          href="/app/estates"
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Estates
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Properties
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          {propertyItem.name || "Property"}
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">Documents</span>
      </nav>
      {forbiddenFlag ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to add or retag documents.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}/collaborators`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <header className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Property documents
            </h1>

            <p className="text-sm text-slate-400">
              Documents scoped to{" "}
              <span className="font-medium text-slate-200">
                {propertyItem.name || "Property"}
              </span>
              {addressDisplay ? (
                <>
                  {" "}
                  —{" "}
                  <span className="font-mono text-xs">{addressDisplay}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 text-xs md:justify-end">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-900"
            >
              View property
            </Link>
            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/documents?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-semibold text-rose-100 hover:bg-rose-500/20"
              >
                Add / tag document
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}/collaborators`}
                className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Request edit access
              </Link>
            )}
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-900"
            >
              Estate documents
            </Link>

            <span className="ml-1 inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 font-medium uppercase tracking-wide text-rose-100">
              Property scope
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {roleLabel(role)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-300">
              Tag
              <span className="ml-1 font-mono text-[10px] bg-slate-900/70 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 max-w-2xl">
          This view stays focused on one address. Any file in your estate
          document index tagged with{" "}
          <span className="font-mono text-[11px] bg-slate-900/60 px-1.5 py-0.5 rounded">
            {tag}
          </span>{" "}
          will automatically show up here—great for banks, insurers, and
          contractors who only need to see one property.
        </p>
      </header>

      {/* Content */}
      {/* Filters */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
              Total: <span className="ml-1 text-slate-200">{documents.length}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5">
              Showing: <span className="ml-1 text-slate-200">{filteredDocs.length}</span>
            </span>
          </div>
          {hasFilters ? <span>Filters active</span> : null}
        </div>

        <form
          method="GET"
          className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="q" className="whitespace-nowrap text-[11px] text-slate-400">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Search label, subject, tags…"
              className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50 placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 md:w-auto">
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Subject</span>
              <select
                name="subject"
                defaultValue={subjectFilter}
                className="h-7 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50"
              >
                <option value="">All</option>
                {subjects.map((value) => (
                  <option key={value} value={value}>
                    {SUBJECT_LABELS[value] ?? value}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Tag</span>
              <input
                type="text"
                name="tag"
                defaultValue={tagFilter}
                className="h-7 w-24 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50"
                placeholder="Tag"
              />
            </label>

            {canViewSensitive ? (
              <label className="flex items-center gap-1 text-[11px] text-slate-400">
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

            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              <input
                type="checkbox"
                name="hasUrl"
                value="1"
                defaultChecked={hasUrlOnly}
                className="h-3 w-3"
              />
              Has link
            </label>

            {hasFilters ? (
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}/documents`}
                className="whitespace-nowrap text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear filters
              </Link>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900/60 px-3 text-[11px] font-medium text-slate-200 hover:bg-slate-900"
            >
              Apply
            </button>
          </div>
        </form>
      </section>

      {!hasDocs ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">
            No documents have been tagged for this property yet.
          </p>
          <p className="mt-1 text-slate-400">
            When documents in your estate index include the tag{" "}
            <span className="font-mono text-xs">{tag}</span>,
            they will automatically appear here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/documents?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
              >
                Add / tag a document
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}/collaborators`}
                className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Request edit access
              </Link>
            )}
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900"
            >
              Back to property
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Go to{" "}
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="text-slate-200 underline hover:text-slate-50"
            >
              Estate documents
            </Link>
            {" "}to add or tag a file.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
            <li>Deeds and title work</li>
            <li>Repair quotes, invoices, and receipts</li>
            <li>Insurance policies and correspondence</li>
            <li>Lease agreements and move-in checklists</li>
          </ul>
        </div>
      ) : !hasFilteredDocs ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No matches</p>
          <p className="mt-1 text-slate-400">
            No documents match your current search or filters.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/documents`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900"
            >
              Clear filters
            </Link>
            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/documents?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
              >
                Add / tag document
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}/collaborators`}
                className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                Request edit access
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredDocs.map((doc) => (
              <div
                key={doc._id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-50">
                      {doc.label || "Untitled"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {(SUBJECT_LABELS[doc.subject] ?? doc.subject)
                        ? (SUBJECT_LABELS[doc.subject] ?? doc.subject)
                        : "—"}
                      {doc.tags?.length ? (
                        <>
                          {" "}•{" "}
                          <span className="font-mono text-[11px]">
                            {doc.tags.join(", ")}
                          </span>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {doc.isSensitive ? (
                        <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-900/30 px-2 py-0.5 text-[10px] font-medium text-rose-200">
                          Sensitive
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          Standard
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Created {formatDate(doc.createdAt)}
                    </p>
                  </div>

                  {safeExternalUrl(doc.url) ? (
                    <a
                      href={safeExternalUrl(doc.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-900"
                    >
                      View
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-500">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 text-sm md:block">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-950/40">
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 text-left">Label</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Tags</th>
                  <th className="px-3 py-2 text-left">Link</th>
                  <th className="px-3 py-2 text-left">Sensitive</th>
                  <th className="px-3 py-2 text-left">Created</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {filteredDocs.map((doc) => (
                  <tr key={doc._id} className="text-slate-200">
                    <td className="px-3 py-2">
                      {doc.label || (
                        <span className="text-slate-500">Untitled</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {(SUBJECT_LABELS[doc.subject] ?? doc.subject) ? (
                        SUBJECT_LABELS[doc.subject] ?? doc.subject
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{doc.location || <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {doc.tags?.length ? doc.tags.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {safeExternalUrl(doc.url) ? (
                        <a
                          href={safeExternalUrl(doc.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-900"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {doc.isSensitive ? (
                        <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-900/30 px-2 py-0.5 text-[10px] font-medium text-rose-200">
                          Sensitive
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          Standard
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}