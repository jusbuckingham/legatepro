import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

type PageProps = {
  params: {
    estateId: string;
    invoiceId: string;
  };
};

type InvoiceLineItem = {
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
  amountCents?: number;
};

type EstateLean = {
  displayName?: string;
  caseName?: string;
} & Record<string, unknown>;

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const { estateId, invoiceId } = params;

  const [estateDoc, invoiceDoc, settings] = await Promise.all([
    Estate.findOne({
      _id: estateId,
      ownerId: session.user.id,
    })
      .lean()
      .exec(),
    Invoice.findOne({
      _id: invoiceId,
      estateId,
      ownerId: session.user.id,
    })
      .lean()
      .exec(),
    WorkspaceSettings.findOne({
      ownerId: session.user.id,
    })
      .lean()
      .catch(() => null as unknown as null),
  ]);

  if (!estateDoc || !invoiceDoc) {
    notFound();
  }

  const estate = estateDoc as EstateLean;

  const firmName = settings?.firmName ?? "Your Firm Name";
  const firmAddressParts = [
    settings?.firmAddressLine1,
    settings?.firmAddressLine2,
    [settings?.firmCity, settings?.firmState, settings?.firmPostalCode]
      .filter(Boolean)
      .join(", "),
    settings?.firmCountry,
  ]
    .filter((part) => part && String(part).trim().length > 0)
    .map((part) => String(part))
    .join(" • ");

  const defaultRateCents =
    typeof settings?.defaultHourlyRateCents === "number"
      ? settings.defaultHourlyRateCents
      : 0;

  const issueDateLabel = invoiceDoc.issueDate
    ? format(new Date(invoiceDoc.issueDate), "MMM d, yyyy")
    : "—";

  const dueDateLabel = invoiceDoc.dueDate
    ? format(new Date(invoiceDoc.dueDate), "MMM d, yyyy")
    : "—";

  const totalCents =
    typeof invoiceDoc.totalAmount === "number"
      ? invoiceDoc.totalAmount
      : typeof invoiceDoc.subtotal === "number"
      ? invoiceDoc.subtotal
      : 0;

  const currency = invoiceDoc.currency ?? "USD";

  const formattedTotal = `${currency} ${(totalCents / 100).toFixed(2)}`;

  const invoiceNumberLabel =
    invoiceDoc.invoiceNumber ||
    (invoiceDoc._id && typeof invoiceDoc._id === "string"
      ? `…${invoiceDoc._id.slice(-6)}`
      : "Invoice");

  const statusLabel = invoiceDoc.status ?? "DRAFT";

  const lineItemsArray = Array.isArray(invoiceDoc.lineItems)
    ? invoiceDoc.lineItems
    : [];

  const subtotalCents =
    typeof invoiceDoc.subtotal === "number"
      ? invoiceDoc.subtotal
      : lineItemsArray.reduce((acc: number, item: InvoiceLineItem) => {
          const q =
            typeof item.quantity === "number" ? item.quantity : 0;
          const unit =
            typeof item.unitPriceCents === "number"
              ? item.unitPriceCents
              : 0;
          const explicit =
            typeof item.amountCents === "number"
              ? item.amountCents
              : 0;

          const effectiveUnit =
            unit > 0
              ? unit
              : defaultRateCents > 0
              ? defaultRateCents
              : 0;

          const derived =
            q > 0 && effectiveUnit > 0 ? q * effectiveUnit : 0;

          return acc + (explicit || derived);
        }, 0);

  const subtotalLabel = `${currency} ${(subtotalCents / 100).toFixed(2)}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Firm branding from workspace settings */}
      <section className="space-y-0.5 text-xs text-slate-400">
        <div className="font-semibold text-slate-100">{firmName}</div>
        {firmAddressParts && firmAddressParts.length > 0 && (
          <div className="text-[11px] text-slate-400">
            {firmAddressParts}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-slate-100">
            Invoice {invoiceNumberLabel}
          </h1>
          <p className="text-xs text-slate-400">
            Estate:{" "}
            <Link
              href={`/app/estates/${estateId}`}
              className="text-sky-400 hover:text-sky-300"
            >
              {estate.displayName ?? estate.caseName ?? "Estate"}
            </Link>
          </p>
          <p className="text-xs text-slate-400">
            Status:{" "}
            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200">
              {statusLabel}
            </span>
          </p>
        </div>

        <div className="space-y-1 text-right text-xs text-slate-400">
          <p>
            Issue date:{" "}
            <span className="text-slate-100">{issueDateLabel}</span>
          </p>
          <p>
            Due date:{" "}
            <span className="text-slate-100">{dueDateLabel}</span>
          </p>
          <p>
            Total:{" "}
            <span className="font-semibold text-slate-100">
              {formattedTotal}
            </span>
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Line items
          </h2>
        </div>

        {lineItemsArray.length === 0 ? (
          <p className="text-xs text-slate-500">
            No line items recorded on this invoice.
          </p>
        ) : (
          <table className="w-full text-xs text-slate-200">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-1 text-left font-medium">Description</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Rate</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lineItemsArray.map((item: InvoiceLineItem, idx: number) => {
                const q =
                  typeof item.quantity === "number"
                    ? item.quantity
                    : null;
                const unit =
                  typeof item.unitPriceCents === "number"
                    ? item.unitPriceCents
                    : null;
                const explicitAmount =
                  typeof item.amountCents === "number"
                    ? item.amountCents
                    : 0;

                const effectiveUnit =
                  unit != null && unit > 0
                    ? unit
                    : defaultRateCents > 0
                    ? defaultRateCents
                    : null;

                const derivedAmount =
                  q != null && effectiveUnit != null
                    ? q * effectiveUnit
                    : 0;

                const amount =
                  explicitAmount > 0 ? explicitAmount : derivedAmount;

                const rateLabel =
                  effectiveUnit != null
                    ? `${currency} ${(effectiveUnit / 100).toFixed(2)}`
                    : "—";
                const amountLabel = `${currency} ${(amount / 100).toFixed(
                  2,
                )}`;

                return (
                  <tr key={idx}>
                    <td className="py-1 pr-2 align-top">
                      {item.description || "—"}
                    </td>
                    <td className="py-1 text-right align-top">
                      {q != null ? q : "—"}
                    </td>
                    <td className="py-1 text-right align-top">
                      {rateLabel}
                    </td>
                    <td className="py-1 text-right align-top">
                      {amountLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-800">
              <tr>
                <td colSpan={3} className="py-2 text-right text-slate-400">
                  Subtotal
                </td>
                <td className="py-2 text-right font-semibold text-slate-100">
                  {subtotalLabel}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1 text-right text-slate-400">
                  Total
                </td>
                <td className="py-1 text-right font-semibold text-slate-100">
                  {formattedTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {invoiceDoc.notes && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-100">
            Notes
          </h2>
          <p className="text-xs text-slate-300 whitespace-pre-line">
            {invoiceDoc.notes}
          </p>
        </div>
      )}
    </div>
  );
}