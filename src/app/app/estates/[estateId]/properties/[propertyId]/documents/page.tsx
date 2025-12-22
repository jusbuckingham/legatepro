import { connectToDatabase } from "../../../../../../../lib/db";
import { EstateDocument } from "../../../../../../../models/EstateDocument";
import { EstateProperty } from "../../../../../../../models/EstateProperty";
import Link from "next/link";

interface PropertyDocumentsPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  _id: { toString(): string };
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface DocumentItem {
  _id: { toString(): string };
  estateId?: { toString(): string } | string;
  title?: string;
  category?: string;
  tags?: string[];
  url?: string;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

function formatDate(value?: string | Date) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function formatAddress(p: PropertyItem) {
  const line1 = p.addressLine1 || "";
  const line2 = p.addressLine2 || "";
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  const postal = p.postalCode || "";
  return [line1, line2, [cityState, postal].filter(Boolean).join(" ")]
    .filter((line) => line.trim() !== "")
    .join(" · ");
}

export default async function PropertyDocumentsPage({
  params,
}: PropertyDocumentsPageProps) {
  const { estateId, propertyId } = params;

  await connectToDatabase();

  // Fetch property info
  const property = (await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  }).lean()) as PropertyItem | null;

  // Fetch documents tagged with this property
  const docs = (await EstateDocument.find({
    estateId,
    tags: { $in: [`property:${propertyId}`] },
  })
    .sort({ createdAt: -1 })
    .lean()) as unknown as DocumentItem[];

  const hasDocs = docs.length > 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500">
        <Link
          href="/app/estates"
          className="text-slate-400 hover:text-slate-200"
        >
          Estates
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties`}
          className="text-slate-400 hover:text-slate-200"
        >
          Properties
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}`}
          className="text-slate-400 hover:text-slate-200"
        >
          {property ? property.label : "Property"}
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">Documents</span>
      </nav>

      {/* Header */}
      <header className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Property documents
            </h1>

            {property ? (
              <p className="text-sm text-slate-400">
                Documents scoped to{" "}
                <span className="font-medium text-slate-200">
                  {property.label}
                </span>
                {formatAddress(property) && (
                  <>
                    {" "}
                    —{" "}
                    <span className="font-mono text-xs">
                      {formatAddress(property)}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                Showing documents linked to property ID{" "}
                <span className="font-mono text-xs">{propertyId}</span>.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 text-xs md:justify-end">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-900"
            >
              View property
            </Link>
            <Link
              href={`/app/estates/${estateId}/documents`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-900"
            >
              Estate documents
            </Link>

            <span className="ml-1 inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 font-medium uppercase tracking-wide text-rose-100">
              Property scope
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-300">
              Tag
              <span className="ml-1 font-mono text-[10px] bg-slate-900/70 px-1.5 py-0.5 rounded">
                property:{propertyId}
              </span>
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 max-w-2xl">
          This view stays focused on one address. Any file in your estate
          document index tagged with{" "}
          <span className="font-mono text-[11px] bg-slate-900/60 px-1.5 py-0.5 rounded">
            property:{propertyId}
          </span>{" "}
          will automatically show up here—great for banks, insurers, and
          contractors who only need to see one property.
        </p>
      </header>

      {/* Content */}
      {!hasDocs ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">
            No documents have been tagged for this property yet.
          </p>
          <p className="mt-1 text-slate-400">
            When documents in your estate index include the tag{" "}
            <span className="font-mono text-xs">property:{propertyId}</span>,
            they will automatically appear here.
          </p>
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
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 text-sm">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/40">
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-left">Link</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {docs.map((doc) => (
                <tr key={doc._id.toString()} className="text-slate-200">
                  <td className="px-3 py-2">
                    {doc.title || (
                      <span className="text-slate-500">Untitled</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {doc.category || (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {doc.tags?.length
                      ? doc.tags.join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                  <td className="px-3 py-2">{formatDate(doc.updatedAt)}</td>
                  <td className="px-3 py-2">
                    {doc.url ? (
                      <a
                        href={doc.url}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}