import { notFound } from "next/navigation";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { EstateProperty } from "@/models/EstateProperty";
import { Task } from "@/models/Task";
import { EstateDocument } from "@/models/EstateDocument";
import { Contact } from "@/models/Contact";
import { EstateNote } from "@/models/EstateNote";
import { DeleteEstateButton } from "@/components/estate/DeleteEstateButton";

type EstateDetail = {
  _id: string | { toString(): string };
  name?: string;
  estateName?: string;
  caseNumber?: string;
  courtCaseNumber?: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  county?: string;
  jurisdiction?: string;
  decedentName?: string;
  decedentDateOfDeath?: string | Date;
  notes?: string;
};

interface PageProps {
  params: Promise<{ estateId: string }>;
}

type EstateStats = {
  totalPropertyValue: number;
  propertyCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  documentCount: number;
  contactCount: number;
  noteCount: number;
};

type ActivityKind = "task" | "document" | "note";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  label: string;
  href: string;
  date: Date;
  meta?: string;
};

async function getEstate(id: string): Promise<EstateDetail | null> {
  try {
    const estate = await Estate.findById(id).lean();
    if (!estate) return null;
    return estate as EstateDetail;
  } catch {
    return null;
  }
}

async function getEstateStats(estateId: string): Promise<EstateStats> {
  const [propertyTotals, propertyCount, openTaskCount, doneTaskCount, documentCount, contactCount, noteCount] =
    await Promise.all([
      EstateProperty.aggregate<{ _id: unknown; total: number }>([
        { $match: { estateId } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: ["$estimatedValue", 0],
              },
            },
          },
        },
      ]),
      EstateProperty.countDocuments({ estateId }),
      Task.countDocuments({ estateId, status: "OPEN" }),
      Task.countDocuments({ estateId, status: "DONE" }),
      EstateDocument.countDocuments({ estateId }),
      Contact.countDocuments({ estateId }),
      EstateNote.countDocuments({ estateId }),
    ]);

  const totalPropertyValue = propertyTotals[0]?.total ?? 0;

  return {
    totalPropertyValue,
    propertyCount,
    openTaskCount,
    doneTaskCount,
    documentCount,
    contactCount,
    noteCount,
  };
}

async function getRecentActivity(estateId: string): Promise<ActivityItem[]> {
  const [recentTasks, recentDocuments, recentNotes] = await Promise.all([
    Task.find({ estateId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    EstateDocument.find({ estateId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    EstateNote.find({ estateId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const taskItems: ActivityItem[] = recentTasks.map((task) => {
    const id = String((task as { _id: unknown })._id);
    const updatedAt = (task as { updatedAt?: Date; createdAt?: Date }).updatedAt ??
      (task as { createdAt?: Date }).createdAt ??
      new Date();

    return {
      id,
      kind: "task",
      label: (task as { subject?: string }).subject || "Task",
      href: `/app/estates/${estateId}/tasks/${id}`,
      date: new Date(updatedAt),
      meta: (task as { status?: string }).status === "DONE" ? "Completed" : "Open",
    };
  });

  const documentItems: ActivityItem[] = recentDocuments.map((doc) => {
    const id = String((doc as { _id: unknown })._id);
    const updatedAt = (doc as { updatedAt?: Date; createdAt?: Date }).updatedAt ??
      (doc as { createdAt?: Date }).createdAt ??
      new Date();

    return {
      id,
      kind: "document",
      label: (doc as { subject?: string }).subject || "Document",
      href: `/app/estates/${estateId}/documents/${id}`,
      date: new Date(updatedAt),
    };
  });

  const noteItems: ActivityItem[] = recentNotes.map((note) => {
    const id = String((note as { _id: unknown })._id);
    const updatedAt = (note as { updatedAt?: Date; createdAt?: Date }).updatedAt ??
      (note as { createdAt?: Date }).createdAt ??
      new Date();

    return {
      id,
      kind: "note",
      label: (note as { title?: string }).title || "Note",
      href: `/app/estates/${estateId}/notes/${id}`,
      date: new Date(updatedAt),
    };
  });

  const allItems = [...taskItems, ...documentItems, ...noteItems];

  allItems.sort((a, b) => b.date.getTime() - a.date.getTime());

  return allItems.slice(0, 6);
}

function formatDate(v?: string | Date) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return "—";
  } catch {
    return "—";
  }
}

function formatDateTime(v?: string | Date | Date) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return "";
  } catch {
    return "";
  }
}

function formatCurrency(value: number): string {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function EstatePage({ params }: PageProps) {
  const { estateId } = await params;

  await connectToDatabase();

  const [estate, stats, activity] = await Promise.all([
    getEstate(estateId),
    getEstateStats(estateId),
    getRecentActivity(estateId),
  ]);

  if (!estate) return notFound();

  const id = estate._id?.toString?.() ?? String(estate._id ?? "");
  const title = estate.name || estate.estateName || "Untitled estate";
  const caseNumber = estate.caseNumber || estate.courtCaseNumber || "—";
  const status = estate.status || "Draft";
  const jurisdiction = estate.county || estate.jurisdiction || "—";
  const decedentName = estate.decedentName || "—";

  const createdLabel = formatDate(estate.createdAt);
  const updatedLabel = formatDate(estate.updatedAt);
  const decedentDateOfDeath = formatDate(estate.decedentDateOfDeath);

  const {
    totalPropertyValue,
    propertyCount,
    openTaskCount,
    doneTaskCount,
    documentCount,
    contactCount,
    noteCount,
  } = stats;

  const notesPreview = estate.notes?.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Estate</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>Case #{caseNumber}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span>{jurisdiction}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span>Decedent: {decedentName}</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span>DOD: {decedentDateOfDeath}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
            Status: {status}
          </span>
          <Link
            href={`/app/estates/${id}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            Edit estate
          </Link>
          <DeleteEstateButton estateId={id} estateTitle={title} />
        </div>
      </div>

      {/* Meta row */}
      <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Created</div>
          <div className="mt-1 text-sm text-slate-100">{createdLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Last updated</div>
          <div className="mt-1 text-sm text-slate-100">{updatedLabel}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">ID</div>
          <div className="mt-1 truncate text-[11px] text-slate-400">{id}</div>
        </div>
      </div>

      {/* At-a-glance stats */}
      <div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Estate assets</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {formatCurrency(totalPropertyValue)}
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              {propertyCount} {propertyCount === 1 ? "item" : "items"}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Tasks</div>
          <div className="mt-1 flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-slate-100">{openTaskCount}</span>
            <span className="text-[11px] text-amber-300">open</span>
            <span className="inline-block h-1 w-1 rounded-full bg-slate-600" />
            <span className="text-xs text-slate-400">{doneTaskCount} completed</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Records</div>
          <div className="mt-1 space-y-1 text-[11px] text-slate-300">
            <div>Documents: {documentCount}</div>
            <div>Contacts: {contactCount}</div>
            <div>Notes: {noteCount}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          {/* Overview & notes */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Overview &amp; notes</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Keep a high-level summary of where this estate stands. For detailed entries, use the Notes tab.
                </p>
              </div>
              <Link
                href={`/app/estates/${id}/notes`}
                className="text-xs font-medium text-emerald-300 hover:underline"
              >
                Open notes
              </Link>
            </div>

            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-200">
              {notesPreview ? (
                <p className="whitespace-pre-wrap leading-relaxed">{notesPreview}</p>
              ) : (
                <p className="text-slate-500">
                  No overview added yet. You can either edit this estate to add a summary, or start logging detailed notes
                  in the Notes section.
                </p>
              )}
            </div>
          </div>

          {/* Activity timeline */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Recent activity</h3>
              <p className="text-[11px] text-slate-500">Latest tasks, documents, and notes</p>
            </div>

            {activity.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                No activity yet. As you add tasks, documents, and notes, they will appear here.
              </div>
            ) : (
              <ul className="mt-4 space-y-3 text-xs">
                {activity.map((item) => {
                  const kindLabel =
                    item.kind === "task" ? "Task" : item.kind === "document" ? "Document" : "Note";

                  return (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-900 bg-slate-950/70 p-3"
                    >
                      <div className="space-y-0.5">
                        <Link
                          href={item.href}
                          className="text-[13px] font-medium text-slate-100 hover:underline"
                        >
                          {item.label}
                        </Link>
                        <div className="text-[11px] text-slate-500">
                          {kindLabel}
                          {item.meta ? <span className="ml-1 text-slate-400">· {item.meta}</span> : null}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-500">
                        {formatDateTime(item.date)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {/* Quick links */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Quick links</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-300">
              <li>
                <Link href={`/app/estates/${id}/tasks`} className="hover:underline">
                  → View tasks
                </Link>
              </li>
              <li>
                <Link href={`/app/estates/${id}/documents`} className="hover:underline">
                  → View documents
                </Link>
              </li>
              <li>
                <Link href={`/app/estates/${id}/properties`} className="hover:underline">
                  → View properties
                </Link>
              </li>
              <li>
                <Link href={`/app/estates/${id}/contacts`} className="hover:underline">
                  → View contacts
                </Link>
              </li>
              <li>
                <Link href={`/app/estates/${id}/notes`} className="hover:underline">
                  → View notes
                </Link>
              </li>
              <li>
                <Link href={`/app/estates/${id}/expenses`} className="hover:underline">
                  → View expenses
                </Link>
              </li>
            </ul>
          </div>

          {/* Next steps placeholder for future smart suggestions */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-semibold text-slate-100">Next steps</h3>
            <p className="mt-2 text-xs text-slate-400">
              As LegatePro evolves, this panel will surface smart recommendations — upcoming deadlines, missing documents,
              and suggested tasks based on where you are in the probate process.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}