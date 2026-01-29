import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { EstateProperty } from "@/models/EstateProperty";
import { DeletePropertyButton } from "@/components/estate/DeletePropertyButton";

export const metadata = {
  title: "Property | LegatePro",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstatePropertyItem = {
  _id: string | { toString(): string };
  estate?: string | { toString(): string };
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  estimatedValue?: number;
  ownershipPercentage?: number;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

function canEdit(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

type PageProps = {
  params: Promise<{ estateId: string; propertyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const raw = sp?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

function safeCallbackUrl(path: string): string {
  return encodeURIComponent(path);
}

async function getProperty(
  estateId: string,
  propertyId: string,
): Promise<EstatePropertyItem | null> {
  await connectToDatabase();

  const property = await EstateProperty.findOne({
    _id: propertyId,
    estate: estateId,
  })
    .lean<EstatePropertyItem | null>()
    .exec();

  return property ?? null;
}

function formatCurrency(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return String(value);
  }
}

function formatDate(value?: string | Date): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default async function PropertyDetailPage({ params, searchParams }: PageProps) {
  const { estateId, propertyId } = await params;
  if (!estateId || !propertyId) {
    notFound();
  }

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = `/app/estates/${estateId}/properties/${propertyId}`;
    redirect(`/login?callbackUrl=${safeCallbackUrl(callbackUrl)}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  if (!access?.role) {
    notFound();
  }
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  const editEnabled = canEdit(role);
  const collaboratorsHref = `/app/estates/${estateId}/collaborators`;

  const property = await getProperty(estateId, propertyId);
  if (!property) {
    notFound();
  }

  const id =
    (typeof property._id === "string"
      ? property._id
      : property._id?.toString?.() ?? "") || propertyId;

  const title = (property.name ?? "").trim() || "Untitled property";

  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const addressLine = [property.address, property.postalCode]
    .filter(Boolean)
    .join(" ")
    .trim();
  const location = [addressLine, cityState].filter(Boolean).join(" • ");

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
          href={`/app/estates/${estateId}`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Overview
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <Link
          href={`/app/estates/${estateId}/properties`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Properties
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">View</span>
      </nav>

      {forbiddenFlag ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to edit or delete properties.
              </p>
            </div>
            <Link
              href={collaboratorsHref}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {!editEnabled ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view this property, but you can’t edit or delete it.
              </p>
            </div>
            <Link
              href={collaboratorsHref}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Property</span>
            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
              Role: {roleLabel(role)}
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
          <p className="text-xs text-slate-400">
            {location || "No address on file yet."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to properties
          </Link>

          {editEnabled ? (
            <Link
              href={`/app/estates/${estateId}/properties/${id}/edit`}
              className="inline-flex items-center rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-50 shadow-sm hover:bg-slate-700"
            >
              Edit property
            </Link>
          ) : (
            <Link
              href={collaboratorsHref}
              className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-500/20"
            >
              Request edit access
            </Link>
          )}

          <Link
            href={`/app/estates/${estateId}/properties/${id}/documents`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Documents
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/rent`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Rent
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${id}/utilities`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Utilities
          </Link>

          {editEnabled ? (
            <DeletePropertyButton estateId={estateId} propertyId={id} propertyTitle={title} />
          ) : null}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Type</p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {property.type || "Not specified"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Estimated value</p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {formatCurrency(property.estimatedValue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Ownership</p>
          <p className="mt-1 text-sm font-medium text-slate-50">
            {property.ownershipPercentage != null ? `${property.ownershipPercentage}%` : "Not set"}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href={`/app/estates/${estateId}/properties/${id}/documents`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Documents</p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Manage property documents
          </p>
          <p className="mt-1 text-xs text-slate-400">Deeds, leases, photos, inspections</p>
        </Link>
        <Link
          href={`/app/estates/${estateId}/properties/${id}/rent`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rent</p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Track rent payments
          </p>
          <p className="mt-1 text-xs text-slate-400">Payments and history</p>
        </Link>
        <Link
          href={`/app/estates/${estateId}/properties/${id}/utilities`}
          className="group rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:bg-slate-950"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Utilities</p>
          <p className="mt-1 text-sm font-medium text-slate-50 group-hover:text-white">
            Manage utility accounts
          </p>
          <p className="mt-1 text-xs text-slate-400">Bills, providers, notes</p>
        </Link>
      </div>

      {/* Details */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Location</h2>
          <div className="space-y-1 text-xs">
            <div>
              <p className="text-slate-500">Address</p>
              <p className="text-slate-100">{property.address || "No address set"}</p>
            </div>
            <div>
              <p className="text-slate-500">City / state</p>
              <p className="text-slate-100">{cityState || "No city/state set"}</p>
            </div>
            <div>
              <p className="text-slate-500">Postal code</p>
              <p className="text-slate-100">{property.postalCode || "No postal code"}</p>
            </div>
            <div>
              <p className="text-slate-500">Country</p>
              <p className="text-slate-100">{property.country || "No country set"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Metadata</h2>
          <div className="space-y-1 text-xs">
            <div>
              <p className="text-slate-500">Created</p>
              <p className="text-slate-100">{formatDate(property.createdAt)}</p>
            </div>
            <div>
              <p className="text-slate-500">Last updated</p>
              <p className="text-slate-100">{formatDate(property.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</h2>
        <p className="whitespace-pre-wrap text-xs text-slate-200">
          {property.notes && property.notes.trim().length > 0
            ? property.notes
            : "No notes added for this property yet."}
        </p>
      </div>
    </div>
  );
}