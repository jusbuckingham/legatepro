import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PropertyForm } from "@/components/estate/PropertyForm";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateProperty } from "@/models/EstateProperty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeCallbackUrl(path: string): string {
  return encodeURIComponent(path);
}

type EstatePropertyItem = {
  _id: string | { toString(): string };
  name?: string;
  label?: string;
  type?: string;
  category?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  estimatedValue?: number;
  ownershipPercentage?: number;
  notes?: string;
};

interface PageProps {
  params: Promise<{
    estateId: string;
    propertyId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const raw = sp?.[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? "";
  return "";
}

async function getPropertyForEdit(
  estateId: string,
  propertyId: string,
): Promise<EstatePropertyItem | null> {
  await connectToDatabase();

  const property = await EstateProperty.findOne({
    _id: propertyId,
    estateId,
  })
    .lean<EstatePropertyItem>()
    .exec();

  return property ?? null;
}

export default async function EditPropertyPage({ params, searchParams }: PageProps) {
  const { estateId, propertyId } = await params;

  if (!estateId || !propertyId) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${safeCallbackUrl(
        `/app/estates/${estateId}/properties/${propertyId}/edit`,
      )}`,
    );
  }

  const access = await requireEstateEditAccess({
    estateId,
    userId: session.user.id,
  });

  if (!access?.role) {
    notFound();
  }

  const role = access.role;

  if (role === "VIEWER") {
    redirect(`/app/estates/${estateId}/properties?forbidden=1`);
  }

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";

  const property = await getPropertyForEdit(estateId, propertyId);

  if (!property) notFound();

  // Ensure downstream pages reflect any edits done via the form.
  // (The form action will also revalidate, but this keeps behavior consistent across routes.)
  revalidatePath(`/app/estates/${estateId}/properties`);
  revalidatePath(`/app/estates/${estateId}/properties/${propertyId}`);
  revalidatePath(`/app/estates/${estateId}`);

  const title = property.name || property.label || "Untitled property";
  const isUntitled = title === "Untitled property";

  const initialValues = {
    name: property.name ?? property.label ?? "",
    type: property.type ?? "",
    category: property.category ?? "",
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    postalCode: property.postalCode ?? "",
    country: property.country ?? "",
    estimatedValue: property.estimatedValue ?? 0,
    ownershipPercentage: property.ownershipPercentage ?? 100,
    notes: property.notes ?? "",
  };

  return (
    <div className="space-y-8 p-6">
      {forbiddenFlag ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="font-medium">Action blocked</div>
          <div className="mt-1 text-xs text-rose-200">
            You don’t have edit permissions for this estate. Request access from the owner to make changes.
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link href={`/app/estates/${estateId}`} className="hover:underline">
                Overview
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link href={`/app/estates/${estateId}/properties`} className="hover:underline">
                Properties
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <span className="text-slate-50">Edit</span>
            </nav>

            <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
              Role: {role}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Edit property
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {isUntitled ? (
              <>Update details for this property.</>
            ) : (
              <>Update details for <span className="font-medium text-slate-200">{title}</span>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/properties`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
          >
            Back to properties
          </Link>
          <Link
            href={`/app/estates/${estateId}/properties/${propertyId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            View property
          </Link>
          <Link
            href={`/app/estates/${estateId}`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            View estate overview
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Property shortcuts
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Jump to related sections for <span className="font-medium text-slate-200">{title}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/documents`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
            >
              Documents
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/rent`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
            >
              Rent
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}/utilities`}
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-800"
            >
              Utilities
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-black/40 sm:p-6">
        <PropertyForm
          estateId={estateId}
          mode="edit"
          propertyId={propertyId}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}