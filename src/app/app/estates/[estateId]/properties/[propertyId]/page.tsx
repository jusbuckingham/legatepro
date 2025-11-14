import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "../../../../../../lib/db";
import { EstateProperty } from "../../../../../../models/EstateProperty";
import { Task } from "../../../../../../models/Task";
import { UtilityAccount } from "../../../../../../models/UtilityAccount";
import { RentPayment } from "../../../../../../models/RentPayment";
import { EstateDocument } from "../../../../../../models/EstateDocument";

export const dynamic = "force-dynamic";

interface PropertyPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

interface PropertyItem {
  _id: unknown;
  estateId: string;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  monthlyRentTarget?: number;
  notes?: string;
  // Optional tenant fields (if present in the schema)
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  tenantNotes?: string;
}

interface TaskItem {
  status?: string;
}

interface UtilityItem {
  isActive?: boolean;
  provider?: string;
  serviceType?: string;
}

interface RentPaymentItem {
  amount?: number;
  paidDate?: string | Date;
  receivedFrom?: string;
}

interface DocumentItem {
  title?: string;
  category?: string;
  createdAt?: string | Date;
}

type ActivityType = "rent" | "document" | "utility";

interface ActivityItem {
  type: ActivityType;
  label: string;
  date: Date;
  meta?: string;
}

function formatAddress(property: PropertyItem) {
  const line1 = property.addressLine1 || "";
  const line2 = property.addressLine2 || "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const postal = property.postalCode || "";

  return [
    [line1, line2].filter(Boolean).join(" "),
    [cityState, postal].filter(Boolean).join(" "),
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function formatRent(value?: number) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function shortDate(value?: string | Date) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activityLabel(type: ActivityType): string {
  switch (type) {
    case "rent":
      return "Rent";
    case "document":
      return "Document";
    case "utility":
      return "Utility";
    default:
      return "Activity";
  }
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { estateId, propertyId } = params;

  await connectToDatabase();

  const [propertyDoc, tasksRaw, utilitiesRaw, rentRaw, docsRaw] =
    await Promise.all([
      EstateProperty.findOne({ _id: propertyId, estateId }).lean(),
      Task.find({ estateId }).lean(),
      UtilityAccount.find({ estateId, propertyId }).lean(),
      RentPayment.find({ estateId, propertyId }).lean(),
      EstateDocument.find({
        estateId,
        tags: { $in: [`property:${propertyId}`] },
      }).lean(),
    ]);

  const property = propertyDoc as PropertyItem | null;

  if (!property) {
    notFound();
  }

  const tasks = (tasksRaw || []) as TaskItem[];
  const utilities = (utilitiesRaw || []) as UtilityItem[];
  const rentPayments = (rentRaw || []) as RentPaymentItem[];
  const docs = (docsRaw || []) as DocumentItem[];

  const address = formatAddress(property);

  // Metrics
  const openTasksCount = tasks.filter(
    (t) => (t.status || "OPEN").toUpperCase() !== "DONE"
  ).length;

  const activeUtilityCount = utilities.filter(
    (u) => u.isActive !== false
  ).length;

  const totalRentCollected = rentPayments.reduce(
    (sum, r) => sum + (r.amount ?? 0),
    0
  );

  const lastRentPayment = rentPayments
    .filter((r) => !!r.paidDate)
    .sort((a, b) => {
      const da = new Date(a.paidDate as string).getTime();
      const db = new Date(b.paidDate as string).getTime();
      return db - da;
    })[0];

  const propertyDocsCount = docs.length;

  // Recent activity (simple stitched feed)
  const activities: ActivityItem[] = [];

  rentPayments.slice(0, 5).forEach((r) => {
    if (!r.paidDate) return;
    activities.push({
      type: "rent",
      label: r.receivedFrom
        ? `Rent from ${r.receivedFrom}`
        : "Rent payment recorded",
      date: new Date(r.paidDate),
      meta: r.amount != null ? formatRent(r.amount) : undefined,
    });
  });

  docs.slice(0, 5).forEach((d) => {
    if (!d.createdAt) return;
    activities.push({
      type: "document",
      label: d.title || "New document added",
      date: new Date(d.createdAt),
      meta: d.category,
    });
  });

  utilities.slice(0, 5).forEach((u) => {
    activities.push({
      type: "utility",
      label: u.provider || "Utility account",
      date: new Date(),
      meta: u.serviceType,
    });
  });

  activities.sort((a, b) => b.date.getTime() - a.date.getTime());

  const recentActivity = activities.slice(0, 6);

  const tenantName = property.tenantName;
  const hasTenant =
    !!tenantName || !!property.tenantPhone || !!property.tenantEmail;

  return (
    <div className="space-y-6">
      {/* Top breadcrumb + edit */}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
          >
            <span className="text-slate-500">←</span>
            Properties
          </Link>
          <span className="text-slate-600">/</span>
          <span
            className="max-w-xs truncate text-slate-300"
            title={property.label}
          >
            {property.label}
          </span>
        </div>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/edit`}
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/60 bg-rose-950/60 px-2 py-1 text-[11px] font-medium text-rose-100 hover:border-rose-400 hover:text-white"
        >
          Edit property
        </Link>
      </div>

      {/* Main header / summary */}
      <header className="space-y-3 rounded-xl border border-rose-900/60 bg-slate-950/80 p-4 shadow-sm shadow-rose-950/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
              {property.label}
            </h1>
            {address && (
              <pre className="whitespace-pre-wrap text-[11px] text-slate-300">
                {address}
              </pre>
            )}
            {property.notes && (
              <p className="mt-1 text-xs text-slate-300">{property.notes}</p>
            )}
            <p className="mt-2 text-[11px] text-slate-400 max-w-xl">
              This is the profile for this property inside the estate. Use the
              tiles below to jump into rent, utilities, and documents that all
              tie back to this address.
            </p>
          </div>

          <div className="grid gap-2 text-xs text-slate-300 md:text-right">
            {property.propertyType && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Type
                </p>
                <p className="font-medium text-slate-100">
                  {property.propertyType}
                </p>
              </div>
            )}
            {(property.bedrooms != null || property.bathrooms != null) && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Beds / baths
                </p>
                <p className="font-medium text-slate-100">
                  {property.bedrooms ?? "–"} bd ·{" "}
                  {property.bathrooms ?? "–"} ba
                </p>
              </div>
            )}
            {property.monthlyRentTarget != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  Target rent
                </p>
                <p className="font-medium text-emerald-300">
                  {formatRent(property.monthlyRentTarget)}/mo
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tenant card */}
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.3fr),minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-200">
              Tenant &amp; occupancy
            </p>
            {hasTenant ? (
              <div className="mt-2 space-y-1 text-slate-200">
                {tenantName && (
                  <p className="text-sm font-medium text-slate-50">
                    {tenantName}
                  </p>
                )}
                {property.tenantPhone && (
                  <p className="text-[11px] text-slate-300">
                    <span className="text-slate-500">Phone:</span>{" "}
                    {property.tenantPhone}
                  </p>
                )}
                {property.tenantEmail && (
                  <p className="text-[11px] text-slate-300">
                    <span className="text-slate-500">Email:</span>{" "}
                    {property.tenantEmail}
                  </p>
                )}
                {property.tenantNotes && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {property.tenantNotes}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                No tenant details saved yet. You can capture things like tenant
                name, contact info, and notes from the{" "}
                <span className="text-rose-200">property edit</span> page or the
                rent workspace.
              </p>
            )}
          </div>

          {/* Photos placeholder */}
          <div className="rounded-lg border border-dashed border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950/60 p-3 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-200">
              Photos (coming soon)
            </p>
            <p className="mt-2 text-[11px] text-slate-200">
              You&apos;ll be able to attach exterior shots, inspection photos, and
              repair before/after pictures here for quick reference and sharing
              with contractors or your attorney.
            </p>
          </div>
        </div>
      </header>

      {/* Metrics + Activity */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.6fr),minmax(0,1.2fr)]">
        {/* Metrics */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              At a glance
            </p>
            <p className="text-[11px] text-slate-500">
              Tasks are estate-wide; rent, utilities &amp; docs are property-level.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Open estate tasks
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                {openTasksCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Tasks live on the estate, not this property yet.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Active utility accounts
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                {activeUtilityCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                For this address only.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Docs for this property
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-50">
                {propertyDocsCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Based on{" "}
                <span className="font-mono text-[10px]">
                  property:{propertyId}
                </span>{" "}
                tags.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Rent collected (all time)
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">
                {formatRent(totalRentCollected)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                From property-level rent receipts.
              </p>
            </div>
          </div>

          {lastRentPayment && (
            <p className="text-[11px] text-slate-500">
              Last rent payment recorded{" "}
              <span className="text-slate-200">
                {shortDate(lastRentPayment.paidDate)}
              </span>{" "}
              {lastRentPayment.amount != null && (
                <>
                  for{" "}
                  <span className="text-emerald-300">
                    {formatRent(lastRentPayment.amount)}
                  </span>
                </>
              )}
              .
            </p>
          )}
        </div>

        {/* Recent activity */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Recent activity
            </p>
            <p className="text-[11px] text-slate-500">
              Rent, documents, and utilities that touch this address.
            </p>
          </div>

          {recentActivity.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              As you add rent receipts, property-tagged documents, and utilities,
              you&apos;ll see a running feed here to remind you what actually
              happened at this address.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {recentActivity.map((item, idx) => (
                <li
                  key={`${item.type}-${idx}`}
                  className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-950/80 p-2"
                >
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      item.type === "rent"
                        ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                        : item.type === "document"
                        ? "bg-sky-500/15 text-sky-200 border border-sky-500/40"
                        : "bg-amber-500/20 text-amber-100 border border-amber-500/40"
                    }`}
                  >
                    {activityLabel(item.type).charAt(0)}
                  </span>
                  <div className="flex-1">
                    <p className="text-slate-100">{item.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {shortDate(item.date)}{" "}
                      {item.meta && (
                        <>
                          &middot;{" "}
                          <span className="text-slate-400">{item.meta}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Navigation tiles */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/rent`}
          className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-950"
        >
          <h2 className="text-sm font-semibold text-slate-50">
            Rent &amp; tenant
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Track monthly rent, tenant info, and receipts for this specific
            property.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
          className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-950"
        >
          <h2 className="text-sm font-semibold text-slate-50">Utilities</h2>
          <p className="mt-1 text-xs text-slate-400">
            See gas, electric, water, trash, and other utility accounts tied to
            this address.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/documents`}
          className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-950"
        >
          <h2 className="text-sm font-semibold text-slate-50">Documents</h2>
          <p className="mt-1 text-xs text-slate-400">
            Deeds, tax bills, insurance policies, violations, and other
            property-specific documents.
          </p>
        </Link>

        <Link
          href={`/app/estates/${estateId}/properties/${propertyId}/edit`}
          className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-rose-500/60 hover:bg-slate-950"
        >
          <h2 className="text-sm font-semibold text-slate-50">
            Property settings
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Update details like address, type, rent target, and internal notes
            for this property.
          </p>
        </Link>
      </section>
    </div>
  );
}