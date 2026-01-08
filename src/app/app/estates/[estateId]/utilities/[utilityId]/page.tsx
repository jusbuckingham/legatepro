// src/app/app/estates/[estateId]/utilities/[utilityId]/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import { auth } from "@/lib/auth";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { revalidatePath } from "next/cache";

import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";
import { EstateProperty } from "@/models/EstateProperty";

export const dynamic = "force-dynamic";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  return undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function idToString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    const maybe = (value as { toString?: () => string }).toString?.();
    return typeof maybe === "string" ? maybe : undefined;
  }
  return undefined;
}

function roleAtLeast(role: EstateRole, minRole: EstateRole): boolean {
  const order: Record<EstateRole, number> = { OWNER: 3, EDITOR: 2, VIEWER: 1 };
  return order[role] >= order[minRole];
}

function normalizeEstateRole(value: unknown): EstateRole {
  const obj = (value && typeof value === "object") ? (value as Record<string, unknown>) : {};
  const r = asString(obj.role);
  if (r === "OWNER" || r === "EDITOR" || r === "VIEWER") return r;
  return "VIEWER";
}

interface PageProps {
  params: {
    estateId: string;
    utilityId: string;
  };
}

interface UtilityDetail {
  id: string;
  estateId: string;
  provider: string;
  type?: string;
  accountNumber?: string;
  billingName?: string;
  phone?: string;
  email?: string;
  onlinePortalUrl?: string;
  status?: string;
  isAutoPay?: boolean;
  notes?: string;
  propertyId?: string;
  propertyLabel?: string;
}

async function getUtilityDetail(
  estateId: string,
  utilityId: string
): Promise<UtilityDetail | null> {
  await connectToDatabase();

  const rawUtility = await UtilityAccount.findOne({
    _id: utilityId,
    estateId,
  })
    .lean()
    .exec();

  if (!rawUtility) {
    return null;
  }
  const utilityObj = serializeMongoDoc(rawUtility) as Record<string, unknown>;

  let propertyLabel: string | undefined;

  const propertyId = idToString(utilityObj.propertyId);

  if (propertyId) {
    const propertyRaw = await EstateProperty.findById(propertyId).lean().exec();
    if (propertyRaw) {
      const propertyObj = serializeMongoDoc(propertyRaw) as Record<string, unknown>;
      const label = asString(propertyObj.label);
      propertyLabel = label ?? "Property";
    }
  }

  const id = idToString(utilityObj._id) ?? "";

  return {
    id,
    estateId,
    provider: asString(utilityObj.provider) ?? "",
    type: asString(utilityObj.type),
    accountNumber: asString(utilityObj.accountNumber),
    billingName: asString(utilityObj.billingName),
    phone: asString(utilityObj.phone),
    email: asString(utilityObj.email),
    onlinePortalUrl: asString(utilityObj.onlinePortalUrl),
    status: asString(utilityObj.status),
    isAutoPay: asBool(utilityObj.isAutoPay) ?? Boolean(utilityObj.isAutoPay),
    notes: asString(utilityObj.notes),
    propertyId,
    propertyLabel,
  };
}

function formatType(type?: string): string {
  if (!type) return "Unknown";
  const normalized = type.toLowerCase();
  switch (normalized) {
    case "electric":
    case "electricity":
      return "Electric";
    case "gas":
      return "Gas";
    case "water":
      return "Water";
    case "sewer":
      return "Sewer";
    case "trash":
      return "Trash";
    case "internet":
      return "Internet";
    case "cable":
      return "Cable TV";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// Server action to update a single utility record
export async function updateUtility(formData: FormData): Promise<void> {
  "use server";

  const estateId = String(formData.get("estateId") || "");
  const utilityId = String(formData.get("utilityId") || "");

  if (!estateId || !utilityId) {
    return;
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/utilities/${utilityId}`);
  }

  // Throws if user has no access; viewers cannot edit.
  const access = await requireEstateEditAccess({
    estateId,
    userId: session.user.id,
  });

  const role = normalizeEstateRole(access);

  if (!roleAtLeast(role, "EDITOR")) {
    redirect(`/app/estates/${estateId}/utilities/${utilityId}?forbidden=1`);
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {
    provider: asString(formData.get("provider")),
    billingName: asString(formData.get("billingName")),
    phone: asString(formData.get("phone")),
    email: asString(formData.get("email")),
    onlinePortalUrl: asString(formData.get("onlinePortalUrl")),
    type: asString(formData.get("type")),
    status: asString(formData.get("status")),
    isAutoPay: formData.get("isAutoPay") === "on",
    notes: asString(formData.get("notes")),
  };

  await UtilityAccount.findByIdAndUpdate(utilityId, update).exec();

  revalidatePath(`/app/estates/${estateId}/utilities/${utilityId}`);
  revalidatePath(`/app/estates/${estateId}/utilities`);
}

export default async function UtilityDetailPage({ params }: PageProps) {
  const { estateId, utilityId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/utilities/${utilityId}`);
  }

  let role: EstateRole = "VIEWER";
  try {
    const access = await requireEstateAccess({
      estateId,
      userId: session.user.id,
    });
    role = normalizeEstateRole(access);
  } catch {
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <span className="truncate text-rose-200">Unauthorized</span>
            </nav>
          }
          title="Unauthorized"
          description="You don’t have access to this estate (or your session expired)."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/app/estates"
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to estates
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-50">We can’t show this utility account.</p>
          <p className="mt-1 text-sm text-slate-300">
            If you think you should have access, ask an estate OWNER to add you as a collaborator.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/app/estates"
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Return to estates
            </Link>
            <Link
              href={`/login?callbackUrl=/app/estates/${estateId}/utilities/${utilityId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Re-authenticate
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const canEdit = roleAtLeast(role, "EDITOR");

  const utility = await getUtilityDetail(estateId, utilityId);

  if (!utility) {
    return (
      <div className="space-y-8 p-6">
        <PageHeader
          eyebrow={
            <nav className="text-xs text-slate-500">
              <Link href="/app/estates" className="text-slate-400 hover:text-slate-200 hover:underline">
                Estates
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link
                href={`/app/estates/${estateId}`}
                className="text-slate-400 hover:text-slate-200 hover:underline"
              >
                Overview
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <Link
                href={`/app/estates/${estateId}/utilities`}
                className="text-slate-400 hover:text-slate-200 hover:underline"
              >
                Utilities
              </Link>
              <span className="mx-1 text-slate-600">/</span>
              <span className="truncate text-rose-200">Not found</span>
            </nav>
          }
          title="Utility account not found"
          description="This utility record doesn’t exist (or was removed)."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
                {role}
              </span>
              <Link
                href={`/app/estates/${estateId}/utilities`}
                className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
              >
                Back to utilities
              </Link>
            </div>
          }
        />

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-50">We couldn’t find this utility account.</p>
          <p className="mt-1 text-sm text-slate-300">It may have been deleted, or the link might be incorrect.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/app/estates/${estateId}/utilities`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Return to utilities
            </Link>
            <Link
              href={`/app/estates/${estateId}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-900/60"
            >
              Back to overview
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const autopayLabel = utility.isAutoPay ? "Autopay enabled" : "Autopay off";

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Utility account
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              {utility.provider || "Utility account"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {formatType(utility.type)} •{" "}
              {utility.accountNumber ? (
                <span className="font-mono text-xs text-slate-300">
                  {utility.accountNumber}
                </span>
              ) : (
                <span className="text-slate-500">No account number on file</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
            {role}
          </span>
          <div className="flex gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                utility.status === "active"
                  ? "bg-green-700/20 text-green-300"
                  : utility.status === "closed"
                  ? "bg-slate-700/80 text-slate-200"
                  : "bg-slate-800/80 text-slate-300"
              }`}
            >
              {utility.status || "Status unknown"}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                utility.isAutoPay
                  ? "bg-emerald-700/20 text-emerald-300"
                  : "bg-slate-800/80 text-slate-300"
              }`}
            >
              {autopayLabel}
            </span>
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href={`/app/estates/${estateId}/utilities`}
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to estate utilities
            </Link>
            {utility.propertyId && (
              <Link
                href={`/app/estates/${estateId}/properties/${utility.propertyId}/utilities`}
                className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
              >
                View property utilities
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Core details */}
      <div className="grid gap-6 md:grid-cols-3">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Account details
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Billing name
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {utility.billingName || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Utility type
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {formatType(utility.type)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Phone</dt>
              <dd className="mt-1 text-sm text-slate-100">
                {utility.phone || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">Email</dt>
              <dd className="mt-1 text-sm text-slate-100">
                {utility.email || (
                  <span className="text-slate-500">Not provided</span>
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-400">
                Online portal
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {utility.onlinePortalUrl ? (
                  <a
                    href={utility.onlinePortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-rose-300 hover:text-rose-200 hover:underline"
                  >
                    {utility.onlinePortalUrl}
                  </a>
                ) : (
                  <span className="text-slate-500">No portal on file</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Linked property
          </h2>
          {utility.propertyId ? (
            <div className="space-y-2 text-sm text-slate-200">
              <p className="font-medium">
                {utility.propertyLabel ?? "Linked property"}
              </p>
              <p className="text-xs text-slate-400">
                This utility is associated with a specific estate property. Use
                this when you need to show that a particular house kept lights,
                water, or gas on for tenants or preservation.
              </p>
              <Link
                href={`/app/estates/${estateId}/properties/${utility.propertyId}`}
                className="inline-flex items-center text-xs font-medium text-rose-300 hover:text-rose-200"
              >
                View property details →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              This utility is not currently linked to a specific property. You
              can update it later to keep your records clean for court and
              accounting.
            </p>
          )}
        </section>
      </div>

      {/* Notes */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Internal notes
          </h2>
          <span className="text-xs text-slate-500">
            These stay inside LegatePro — they&apos;re not shared with the
            utility company.
          </span>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-100">
          {utility.notes ? (
            <p className="whitespace-pre-wrap">{utility.notes}</p>
          ) : (
            <p className="text-slate-500">
              No notes yet. You might keep track of call reference numbers,
              hardship programs, or instructions from your attorney here.
            </p>
          )}
        </div>
      </section>

      {/* Quick edit */}
      {canEdit ? (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Update this account
            </h2>
            <span className="text-xs text-slate-500">
              Small changes you make here will refresh this page and the estate
              utilities list.
            </span>
          </div>

          <form action={updateUtility} className="space-y-4">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="utilityId" value={utility.id} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Provider
                </label>
                <input
                  name="provider"
                  defaultValue={utility.provider}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Billing name
                </label>
                <input
                  name="billingName"
                  defaultValue={utility.billingName}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Utility type
                </label>
                <input
                  name="type"
                  defaultValue={utility.type}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                  placeholder="electric, gas, water..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Status
                </label>
                <input
                  name="status"
                  defaultValue={utility.status}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                  placeholder="active, closed..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Phone
                </label>
                <input
                  name="phone"
                  defaultValue={utility.phone}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">
                  Email
                </label>
                <input
                  name="email"
                  defaultValue={utility.email}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-slate-400">
                  Online portal URL
                </label>
                <input
                  name="onlinePortalUrl"
                  defaultValue={utility.onlinePortalUrl}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                  placeholder="https://"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  name="isAutoPay"
                  defaultChecked={utility.isAutoPay}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-rose-500"
                />
                Autopay enabled
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">
                Internal notes
              </label>
              <textarea
                name="notes"
                defaultValue={utility.notes}
                className="min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/70"
                placeholder="Court reference numbers, hardship program notes, attorney guidance..."
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-400"
              >
                Save changes
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-100">View-only</p>
          <p className="mt-1 text-sm text-amber-200/90">
            Your role is <span className="font-semibold">{role}</span>. You can view this utility account, but editing requires EDITOR access.
          </p>
          <div className="mt-3">
            <Link
              href={`/app/estates/${estateId}/collaborators?${new URLSearchParams({ request: "EDITOR", from: "utility", utilityId }).toString()}`}
              className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20"
            >
              Request editor access
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}