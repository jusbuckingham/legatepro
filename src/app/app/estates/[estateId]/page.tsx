import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Invoice } from "@/models/Invoice";
import { Contact } from "@/models/Contact";
import { TimeEntry } from "@/models/TimeEntry";
import {
  EstateEvent,
  type EstateEventType,
} from "@/models/EstateEvent";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { EstateContactsPanel } from "@/components/estate/EstateContactsPanel";
import { EstateTimeline } from "@/components/estate/EstateTimeline";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

type EstateDoc = {
  _id: string | { toString: () => string };
  ownerId: string | { toString: () => string };
  displayName?: string;
  caseName?: string;
  caseNumber?: string;
  courtCounty?: string;
  decedentName?: string;
  status?: string;
  createdAt?: Date;
};

type InvoiceLean = {
  _id: string | { toString: () => string };
  estateId: string | { toString: () => string };
  status?: string;
  issueDate?: Date;
  dueDate?: Date;
  totalAmount?: number;
  subtotal?: number;
  notes?: string;
  invoiceNumber?: string;
};

type ContactLean = {
  _id: string | { toString: () => string };
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  estates?: Array<string | { toString: () => string }>;
};

type TimeEntryLean = {
  _id: string | { toString: () => string };
  estateId: string | { toString: () => string };
  ownerId: string | { toString: () => string };
  durationMinutes?: number;
  minutes?: number;
  billableMinutes?: number;
  createdAt?: Date;
};

type WorkspaceSettingsLean = {
  defaultHourlyRateCents?: number;
};

type EstateEventLean = {
  _id: string | { toString: () => string };
  estateId: string | { toString: () => string };
  ownerId: string | { toString: () => string };
  type: EstateEventType;
  summary: string;
  detail?: string;
  createdAt: Date;
};

type TimelineItem = {
  id: string;
  kind: "ESTATE_CREATED" | "INVOICE" | "EVENT";
  label: string;
  description?: string;
  timestamp: Date;
  href?: string;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default async function EstateDetailPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const estate = (await Estate.findOne({
    _id: estateId,
    ownerId: session.user.id,
  }).lean()) as EstateDoc | null;

  if (!estate) {
    notFound();
  }

  const settings = (await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  })
    .lean()
    .catch(() => null as unknown as null)) as WorkspaceSettingsLean | null;

  const estateIdStr =
    typeof estate._id === "string" ? estate._id : estate._id.toString();

  const invoicesRaw = (await Invoice.find({
    ownerId: session.user.id,
    estateId: estateIdStr,
  })
    .sort({ issueDate: -1 })
    .limit(20)
    .lean()) as InvoiceLean[];

  const now = new Date();

  const invoicesForList = invoicesRaw.map((inv) => {
    const invId =
      typeof inv._id === "string" ? inv._id : inv._id.toString();

    const status = (inv.status || "DRAFT").toUpperCase();
    const amount =
      typeof inv.totalAmount === "number"
        ? inv.totalAmount
        : typeof inv.subtotal === "number"
        ? inv.subtotal
        : 0;

    const issueDate = inv.issueDate ?? null;

    const issueDateLabel = issueDate
      ? format(issueDate, "MMM d, yyyy")
      : "—";

    const invoiceNumberLabel =
      inv.invoiceNumber || `…${invId.slice(-6)}`;

    const dueDate = inv.dueDate ?? null;

    return {
      _id: invId,
      status,
      amount,
      invoiceNumberLabel,
      issueDateLabel,
      issueDate,
      dueDate,
    };
  });

  const {
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    overdueCount,
  } = invoicesForList.reduce(
    (acc, inv) => {
      if (inv.status !== "VOID") {
        acc.totalInvoiced += inv.amount;
      }
      if (inv.status === "PAID") {
        acc.totalCollected += inv.amount;
      }
      if (inv.status === "DRAFT" || inv.status === "SENT") {
        acc.totalOutstanding += inv.amount;
        if (inv.dueDate && inv.dueDate < now) {
          acc.overdueCount += 1;
        }
      }
      return acc;
    },
    {
      totalInvoiced: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      overdueCount: 0,
    },
  );

  // --- Time tracking totals for this estate ---
  const timeEntriesRaw = (await TimeEntry.find({
    ownerId: session.user.id,
    estateId: estateIdStr,
  })
    .select("_id estateId ownerId durationMinutes minutes billableMinutes createdAt")
    .lean()) as TimeEntryLean[];

  const {
    totalMinutes,
    billableMinutes,
  } = timeEntriesRaw.reduce(
    (acc, entry) => {
      const minutes =
        typeof entry.durationMinutes === "number"
          ? entry.durationMinutes
          : typeof entry.minutes === "number"
          ? entry.minutes
          : 0;

      const billable =
        typeof entry.billableMinutes === "number"
          ? entry.billableMinutes
          : minutes;

      acc.totalMinutes += minutes;
      acc.billableMinutes += billable;

      return acc;
    },
    {
      totalMinutes: 0,
      billableMinutes: 0,
    },
  );

  const totalHours = totalMinutes / 60;
  const billableHours = billableMinutes / 60;

  const defaultHourlyRateCents =
    typeof settings?.defaultHourlyRateCents === "number"
      ? settings.defaultHourlyRateCents
      : 0;

  const unbilledTimeValue =
    defaultHourlyRateCents > 0
      ? (billableMinutes / 60) * (defaultHourlyRateCents / 100)
      : 0;

  const contactsLinkedRaw = (await Contact.find({
    ownerId: session.user.id,
    estates: estateIdStr,
  })
    .select("_id name email phone role estates")
    .sort({ name: 1 })
    .lean()) as ContactLean[];

  const contactsAvailableRaw = (await Contact.find({
    ownerId: session.user.id,
    $or: [{ estates: { $exists: false } }, { estates: { $ne: estateIdStr } }],
  })
    .select("_id name role estates")
    .sort({ name: 1 })
    .lean()) as ContactLean[];

  const linkedContacts = contactsLinkedRaw.map((c) => ({
    _id:
      typeof c._id === "string" ? c._id : c._id.toString(),
    name: c.name?.trim() || "Unnamed contact",
    email: c.email || undefined,
    phone: c.phone || undefined,
    role: c.role || undefined,
  }));

  const availableContacts = contactsAvailableRaw.map((c) => ({
    _id:
      typeof c._id === "string" ? c._id : c._id.toString(),
    name: c.name?.trim() || "Unnamed contact",
    role: c.role || undefined,
  }));

  const estateName =
    estate.displayName ||
    estate.caseName ||
    estate.decedentName ||
    `Estate …${estateIdStr.slice(-6)}`;

  const statusLabel =
    estate.status?.trim() || "Active";

  const createdLabel = estate.createdAt
    ? format(estate.createdAt, "MMM d, yyyy")
    : "";

  // --- Synthetic timeline items (estate + invoices) ---
  const syntheticTimelineItems: TimelineItem[] = [];

  if (estate.createdAt) {
    syntheticTimelineItems.push({
      id: `estate-created-${estateIdStr}`,
      kind: "ESTATE_CREATED",
      label: "Estate opened",
      description: estateName,
      timestamp: estate.createdAt,
    });
  }

  invoicesForList.forEach((inv) => {
    const timestamp = inv.issueDate ?? now;

    syntheticTimelineItems.push({
      id: `invoice-${inv._id}`,
      kind: "INVOICE",
      label: `Invoice ${inv.invoiceNumberLabel}`,
      description: `${inv.status} · ${formatMoney(inv.amount)}`,
      timestamp,
      href: `/app/estates/${estateIdStr}/invoices/${inv._id}`,
    });
  });

  // --- Persisted estate events ---
  const eventsRaw = (await EstateEvent.find({
    ownerId: session.user.id,
    estateId: estateIdStr,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()) as EstateEventLean[];

  const eventItems: TimelineItem[] = eventsRaw.map((ev) => ({
    id:
      typeof ev._id === "string" ? ev._id : ev._id.toString(),
    kind: "EVENT",
    label: ev.summary,
    description: ev.detail,
    timestamp: ev.createdAt,
  }));

  const timelineItems: TimelineItem[] = [...eventItems, ...syntheticTimelineItems];

  timelineItems.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );

  const limitedTimeline = timelineItems.slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Estate
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            {estateName}
          </h1>
          <p className="text-xs text-slate-400">
            {estate.caseNumber &&
             (<>Case #{estate.caseNumber}
                {estate.courtCounty ? ` · ${estate.courtCounty}` : ""}
              </>)}
            {!estate.caseNumber && estate.courtCounty && (
              <>Filed in {estate.courtCounty}</>
            )}
            {createdLabel && (
              <>
                {" "}
                · Opened {createdLabel}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
            {statusLabel}
          </span>
          <Link
            href={`/app/estates/${estateIdStr}/tasks`}
            className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-[11px] font-medium text-sky-300 hover:bg-slate-800"
          >
            Tasks &amp; time
          </Link>
          <Link
            href={`/app/estates/${estateIdStr}/edit`}
            className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
          >
            Edit estate
          </Link>
        </div>
      </header>

      {/* Billing snapshot */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Billed
          </p>
          <p className="text-xl font-semibold text-slate-50">
            {formatMoney(totalInvoiced)}
          </p>
          <p className="text-[11px] text-slate-500">
            All non-void invoices for this estate.
            {totalMinutes > 0 && (
              <> · {totalHours.toFixed(1)}h tracked ({billableHours.toFixed(1)}h billable)</>
            )}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Collected
          </p>
          <p className="text-xl font-semibold text-emerald-400">
            {formatMoney(totalCollected)}
          </p>
          <p className="text-[11px] text-slate-500">
            Marked as paid.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Outstanding
          </p>
          <p className="text-xl font-semibold text-amber-300">
            {formatMoney(totalOutstanding)}
          </p>
          <p className="text-[11px] text-slate-500">
            {overdueCount > 0
              ? `${overdueCount} invoice(s) overdue.`
              : "No overdue invoices right now."}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Unbilled time value
          </p>
          <p className="text-xl font-semibold text-slate-50">
            {formatMoney(unbilledTimeValue)}
          </p>
          {defaultHourlyRateCents > 0 ? (
            <p className="text-[11px] text-slate-500">
              Estimated value of {billableHours.toFixed(1)}h billable at your workspace rate.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Set a default hourly rate in workspace settings to see estimated unbilled time value.
            </p>
          )}
        </div>
      </section>

      {/* Recent invoices + contacts */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
        {/* Recent invoices */}
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Recent invoices
            </h2>
            <Link
              href={`/app/estates/${estateIdStr}/invoices`}
              className="text-[11px] text-sky-400 hover:text-sky-300"
            >
              View all
            </Link>
          </div>

          {invoicesForList.length === 0 ? (
            <p className="text-xs text-slate-500">
              No invoices created for this estate yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm">
              {invoicesForList.slice(0, 5).map((inv) => (
                <li
                  key={inv._id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <Link
                      href={`/app/estates/${estateIdStr}/invoices/${inv._id}`}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      {inv.invoiceNumberLabel}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      {inv.issueDateLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-100">
                      {formatMoney(inv.amount)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {inv.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Contacts panel */}
        <EstateContactsPanel
          estateId={estateIdStr}
          linkedContacts={linkedContacts}
          availableContacts={availableContacts}
        />
      </section>

      {/* Activity timeline */}
      <EstateTimeline items={limitedTimeline} />
    </div>
  );
}