import { connectToDatabase } from "../../../../../../../lib/db";
import { EstateDocument } from "../../../../../../../models/EstateDocument";
import { EstateProperty } from "../../../../../../../models/EstateProperty";

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
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
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
      </header>

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
                    {doc.title || <span className="text-slate-500">Untitled</span>}
                  </td>
                  <td className="px-3 py-2">
                    {doc.category || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {doc.tags?.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                  <td className="px-3 py-2">{formatDate(doc.updatedAt)}</td>
                  <td className="px-3 py-2">
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 underline text-xs"
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