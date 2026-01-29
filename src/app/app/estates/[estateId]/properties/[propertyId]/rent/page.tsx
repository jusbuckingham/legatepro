import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";

import { EstateProperty } from "@/models/EstateProperty";
import { RentPayment } from "@/models/RentPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Rent | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
    propertyId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PropertyItem = {
  id: string;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type RentPaymentItem = {
  id: string;
  estateId: string;
  propertyId?: string;
  tenantName?: string;
  periodMonth?: number;
  periodYear?: number;
  amount?: number;
  paymentDate?: string | Date;
  method?: string;
  reference?: string;
  notes?: string;
};

type RentPaymentDoc = {
  id: string;
  estateId?: unknown;
  propertyId?: unknown;
  tenantName?: string;
  periodMonth?: number;
  periodYear?: number;
  amount?: number;
  paymentDate?: string | Date;
  method?: string;
  reference?: string;
  notes?: string;
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

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) {
    try {
      return String((value as { toString(): string }).toString());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPropertyItem(raw: unknown): PropertyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Prefer already-serialized `id`, fall back to `_id`.
  const id = asString(r.id ?? r._id);

  // EstateProperty uses `name` in other pages; accept either `label` or `name`.
  const labelRaw =
    typeof r.label === "string"
      ? r.label
      : typeof r.name === "string"
        ? r.name
        : undefined;

  const label = (labelRaw ?? "").trim();
  if (!id || !label) return null;

  // Address fields can vary by model/page; normalize to the display fields we use here.
  const addressLine1 =
    typeof r.addressLine1 === "string"
      ? r.addressLine1
      : typeof r.address === "string"
        ? r.address
        : undefined;

  const addressLine2 = typeof r.addressLine2 === "string" ? r.addressLine2 : undefined;

  return {
    id,
    label,
    addressLine1: addressLine1?.trim() || undefined,
    addressLine2: addressLine2?.trim() || undefined,
    city: typeof r.city === "string" ? r.city.trim() || undefined : undefined,
    state: typeof r.state === "string" ? r.state.trim() || undefined : undefined,
    postalCode: typeof r.postalCode === "string" ? r.postalCode.trim() || undefined : undefined,
  };
}

function toRentPaymentDoc(raw: unknown): RentPaymentDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = asString(r.id ?? r._id);
  if (!id) return null;

  return {
    id,
    estateId: r.estateId,
    propertyId: r.propertyId,
    tenantName: typeof r.tenantName === "string" ? r.tenantName : undefined,
    periodMonth: asNumber(r.periodMonth),
    periodYear: asNumber(r.periodYear),
    amount: asNumber(r.amount),
    paymentDate:
      typeof r.paymentDate === "string" || r.paymentDate instanceof Date
        ? (r.paymentDate as string | Date)
        : undefined,
    method: typeof r.method === "string" ? r.method : undefined,
    reference: typeof r.reference === "string" ? r.reference : undefined,
    notes: typeof r.notes === "string" ? r.notes : undefined,
  };
}

function formatCurrency(value?: number) {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
}

function coerceDate(value?: string | Date): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value?: string | Date) {
  const d = coerceDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(month?: number, year?: number) {
  if (!month || !year) return "—";
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatAddress(property: PropertyItem) {
  const line1 = property.addressLine1 || "";
  const line2 = property.addressLine2 || "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const postal = property.postalCode || "";

  return [line1, line2, [cityState, postal].filter(Boolean).join(" ")]
    .filter((line) => line.trim().length > 0)
    .join(" · ");
}

export default async function PropertyRentPage({ params, searchParams }: PageProps) {
  const { estateId, propertyId } = await params;
  if (!estateId || !propertyId) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const forbiddenFlag = getStringParam(sp, "forbidden") === "1";
  const deletedFlag = getStringParam(sp, "deleted") === "1";
  const errorCode = getStringParam(sp, "error");

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(
      `/app/estates/${estateId}/properties/${propertyId}/rent`
    );
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  async function deleteRentPayment(formData: FormData) {
    "use server";

    const paymentId = formData.get("paymentId");
    const innerEstateId = formData.get("estateId");
    const innerPropertyId = formData.get("propertyId");

    if (
      typeof paymentId !== "string" ||
      typeof innerEstateId !== "string" ||
      typeof innerPropertyId !== "string"
    ) {
      return;
    }

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      const cb = encodeURIComponent(
        `/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent`,
      );
      redirect(`/login?callbackUrl=${cb}`);
    }

    const editAccess = await requireEstateEditAccess({
      estateId: innerEstateId,
      userId: innerSession.user.id,
    });

    if (editAccess.role === "VIEWER") {
      redirect(
        `/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent?forbidden=1`,
      );
    }

    try {
      await connectToDatabase();

      const result = await RentPayment.deleteOne({
        _id: paymentId,
        estateId: innerEstateId,
        propertyId: innerPropertyId,
      });

      if (!result || ("deletedCount" in result && result.deletedCount === 0)) {
        redirect(
          `/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent?error=delete_failed`,
        );
      }
    } catch (error) {
      console.error("[PropertyRentPage] Failed to delete rent payment", {
        paymentId,
        estateId: innerEstateId,
        propertyId: innerPropertyId,
        error: error instanceof Error ? error.message : String(error),
      });

      redirect(
        `/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent?error=delete_failed`,
      );
    }

    revalidatePath(`/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent`);
    revalidatePath(`/app/estates/${innerEstateId}/rent`);
    revalidatePath(`/app/estates/${innerEstateId}/properties/${innerPropertyId}`);

    redirect(`/app/estates/${innerEstateId}/properties/${innerPropertyId}/rent?deleted=1`);
  }

  await connectToDatabase();

  const propertyRaw = await EstateProperty.findOne({
    _id: propertyId,
    estate: estateId,
  }).lean();

  const property = propertyRaw ? toPropertyItem(serializeMongoDoc(propertyRaw)) : null;

  if (!property) {
    notFound();
  }

  const rentPaymentDocsRaw = await RentPayment.find({
    estateId,
    propertyId,
  })
    .sort({ periodYear: -1, periodMonth: -1, paymentDate: -1 })
    .lean();

  const rentPaymentDocs: RentPaymentDoc[] = (rentPaymentDocsRaw ?? [])
    .map((d) => toRentPaymentDoc(serializeMongoDoc(d)))
    .filter((d): d is RentPaymentDoc => Boolean(d));

  const rentPayments: RentPaymentItem[] = rentPaymentDocs.map((doc) => ({
    id: doc.id,
    estateId: doc.estateId ? String(doc.estateId) : estateId,
    propertyId: doc.propertyId ? String(doc.propertyId) : undefined,
    tenantName: doc.tenantName,
    periodMonth: typeof doc.periodMonth === "number" ? doc.periodMonth : undefined,
    periodYear: typeof doc.periodYear === "number" ? doc.periodYear : undefined,
    amount: typeof doc.amount === "number" ? doc.amount : undefined,
    paymentDate: doc.paymentDate,
    method: doc.method,
    reference: doc.reference,
    notes: doc.notes,
  }));

  const hasPayments = rentPayments.length > 0;

  const totalCollected = rentPayments.reduce((sum, payment) => {
    return sum + (payment.amount ?? 0);
  }, 0);

  const lastPaymentDate = rentPayments[0]?.paymentDate;

  const distinctPeriods = new Set(
    rentPayments
      .filter((p) => p.periodYear && p.periodMonth)
      .map((p) => `${p.periodYear}-${p.periodMonth}`)
  ).size;

  const primaryTenant =
    rentPayments.find((p) => p.tenantName && p.tenantName.trim().length > 0)?.tenantName || null;

  const address = formatAddress(property);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
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
            Estate
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
            {property.label || "Property"}
          </Link>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-rose-300">Rent</span>
        </nav>

        {forbiddenFlag ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Action blocked</p>
                <p className="text-xs text-rose-200">
                  You don’t have edit permissions for this estate. Request access from the owner to remove rent payments.
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
        ) : null}

        {deletedFlag ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Payment removed</p>
                <p className="text-xs text-emerald-200">
                  The rent payment entry was removed and the ledger has been refreshed.
                </p>
              </div>
              <Link
                href={`/app/estates/${estateId}/rent/new?propertyId=${encodeURIComponent(propertyId)}`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 md:mt-0"
              >
                Add payment
              </Link>
            </div>
          </div>
        ) : null}

        {errorCode ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-rose-200">We couldn’t complete that action. Please try again.</p>
              </div>
              <Link
                href={`/app/estates/${estateId}/properties/${propertyId}/rent`}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/25 md:mt-0"
              >
                Refresh
              </Link>
            </div>
          </div>
        ) : null}

        {!canEdit ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Viewer access</p>
                <p className="text-xs text-amber-200">
                  You can view this rent ledger, but you can’t add or remove payments.
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
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Rent ledger</span>
              {!canEdit ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                  Read-only
                </span>
              ) : null}
              {primaryTenant ? (
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                  Tenant: {primaryTenant}
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
              Rent &amp; tenant
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Rent history for <span className="font-medium text-slate-100">{property.label}</span>
              {address ? (
                <>
                  {" "}
                  <span className="text-slate-500">•</span>{" "}
                  <span className="text-slate-300">{address}</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              This ledger is scoped to this property so your final accounting is fast and defensible.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/rent/new?propertyId=${encodeURIComponent(propertyId)}`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-500"
              >
                + Add payment
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            )}

            <Link
              href={`/app/estates/${estateId}/rent`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              View estate rent
            </Link>
            <Link
              href={`/app/estates/${estateId}/properties/${propertyId}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              ← Back to property
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total collected</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{formatCurrency(totalCollected)}</p>
          {hasPayments ? (
            <p className="mt-1 text-xs text-slate-500">
              Across {rentPayments.length} recorded payment{rentPayments.length === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Months with activity</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">{hasPayments ? distinctPeriods : "0"}</p>
          <p className="mt-1 text-xs text-slate-500">Based on the period tagged for each payment.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Last payment</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {lastPaymentDate ? formatDate(lastPaymentDate) : "—"}
          </p>
          {lastPaymentDate ? (
            <p className="mt-1 text-xs text-slate-500">Keep this up to date for your final accounting.</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Average payment</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            {hasPayments ? formatCurrency(totalCollected / rentPayments.length) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Quick sanity check across recorded entries.</p>
        </div>
      </section>

      {!hasPayments ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-8 text-sm text-slate-300">
          <p className="font-medium text-slate-100">No rent payments recorded yet for this property.</p>
          <p className="mt-1 text-slate-400">
            Record each payment as it comes in so your ledger, receipts, and final accounting are always ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canEdit ? (
              <Link
                href={`/app/estates/${estateId}/rent/new?propertyId=${encodeURIComponent(propertyId)}`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
              >
                + Add first payment
              </Link>
            ) : (
              <Link
                href={`/app/estates/${estateId}?requestAccess=1`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
              >
                Request edit access
              </Link>
            )}

            <Link
              href={`/app/estates/${estateId}/rent`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-200 hover:border-rose-500/70 hover:text-rose-100"
            >
              View estate rent
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 text-sm">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/80">
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Payment date</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Reference</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rentPayments.map((payment) => (
                <tr key={payment.id} className="text-xs text-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatPeriod(payment.periodMonth, payment.periodYear)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.tenantName || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(payment.paymentDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.method || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{payment.reference || "—"}</td>
                  <td className="max-w-[260px] px-3 py-2 text-slate-300">
                    {payment.notes && payment.notes.trim().length > 0 ? (
                      <span className="line-clamp-2">{payment.notes}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canEdit ? (
                      <form action={deleteRentPayment}>
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="estateId" value={estateId} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <button
                          type="submit"
                          className="text-xs text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline"
                        >
                          Remove
                        </button>
                      </form>
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