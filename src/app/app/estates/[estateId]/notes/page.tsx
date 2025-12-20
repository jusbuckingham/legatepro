import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { EstateNote } from "@/models/EstateNote";

export const dynamic = "force-dynamic";

type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

function canWrite(role: EstateRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

function roleLabel(role: EstateRole): string {
  if (role === "OWNER") return "Owner";
  if (role === "EDITOR") return "Editor";
  return "Viewer";
}

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EstateNoteLean = {
  _id: unknown;
  body?: string | null;
  pinned?: boolean | null;
  createdAt?: Date | string | null;
};

type NoteItem = {
  _id: string;
  body: string;
  pinned: boolean;
  createdAt?: string | null;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

/**
 * Server action: create a new note for the estate.
 */
async function createNote(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const body = formData.get("body")?.toString().trim() ?? "";
  const pinnedRaw = formData.get("pinned")?.toString();

  if (!estateId || !body) {
    return;
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  if (!canWrite(role)) {
    // Viewers can read, but cannot create.
    return;
  }

  await connectToDatabase();

  const pinned =
    pinnedRaw === "on" || pinnedRaw === "true" || pinnedRaw === "1";

  await EstateNote.create({
    estateId,
    ownerId: session.user.id,
    body,
    pinned,
  });

  revalidatePath(`/app/estates/${estateId}/notes`);
}

/**
 * Server action: toggle pinned state for a note.
 */
async function togglePinned(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const noteId = formData.get("noteId")?.toString();
  const nextPinnedRaw = formData.get("nextPinned")?.toString();

  if (!estateId || !noteId || !nextPinnedRaw) {
    return;
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  if (!canWrite(role)) {
    // Viewers can read, but cannot modify.
    return;
  }

  await connectToDatabase();

  const nextPinned =
    nextPinnedRaw === "true" || nextPinnedRaw === "1" || nextPinnedRaw === "on";

  await EstateNote.findOneAndUpdate(
    { _id: noteId, estateId },
    { pinned: nextPinned },
  );

  revalidatePath(`/app/estates/${estateId}/notes`);
}

/**
 * Server action: delete a note.
 */
async function deleteNote(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const noteId = formData.get("noteId")?.toString();

  if (!estateId || !noteId) {
    return;
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  if (!canWrite(role)) {
    // Viewers can read, but cannot delete.
    return;
  }

  await connectToDatabase();

  await EstateNote.findOneAndDelete({
    _id: noteId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/notes`);
}

export default async function EstateNotesPage({
  params,
  searchParams,
}: PageProps) {
  const { estateId } = await params;

  let searchQuery = "";
  let showPinnedOnly = false;

  if (searchParams) {
    const sp = await searchParams;

    const qRaw = sp.q;
    searchQuery =
      typeof qRaw === "string"
        ? qRaw.trim()
        : Array.isArray(qRaw)
        ? (qRaw[0] ?? "").trim()
        : "";

    const pinnedRaw = sp.pinned;
    const pinnedValue =
      typeof pinnedRaw === "string"
        ? pinnedRaw
        : Array.isArray(pinnedRaw)
        ? pinnedRaw[0]
        : "";

    showPinnedOnly =
      pinnedValue === "1" ||
      pinnedValue === "true" ||
      pinnedValue === "on";
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/notes`);
  }

  const access = await requireEstateAccess({ estateId });
  const role: EstateRole = (access?.role as EstateRole) ?? "VIEWER";
  const writeEnabled = canWrite(role);

  await connectToDatabase();

  const docs = (await EstateNote.find(
    { estateId },
    { body: 1, pinned: 1, createdAt: 1 },
  )
    .sort({ pinned: -1, createdAt: -1 })
    .lean()) as EstateNoteLean[];

  const notes: NoteItem[] = docs.map((doc) => {
    const body =
      typeof doc.body === "string" && doc.body.trim().length > 0
        ? doc.body.trim()
        : "";

    const createdAt =
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : (doc.createdAt as string | null | undefined) ?? null;

    return {
      _id: String(doc._id),
      body,
      pinned: Boolean(doc.pinned),
      createdAt,
    };
  });

  const filteredNotes = notes.filter((note) => {
    if (showPinnedOnly && !note.pinned) return false;

    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return note.body.toLowerCase().includes(q);
  });

  const pinnedCount = notes.filter((n) => n.pinned).length;
  const hasFilters = !!searchQuery || showPinnedOnly;

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-50">Notes</span>
          </nav>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Notes for this estate
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Use notes as your running log—calls, advice, ideas, and things you
              don&apos;t want to forget. This space is private and not shared
              with the court or other parties.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-end gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            {roleLabel(role)} access
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <span className="font-medium">{notes.length}</span> note
              {notes.length === 1 ? "" : "s"}
            </span>
            {pinnedCount > 0 && (
              <>
                <span>·</span>
                <span>
                  <span className="font-medium">{pinnedCount}</span> pinned
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Think of this as your private journal for this estate.
          </span>
          {writeEnabled ? (
            <Link
              href="#add-note"
              className="inline-flex items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100 hover:bg-rose-500/20"
            >
              Add note
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}/collaborators`}
              className="inline-flex items-center justify-center rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
            >
              Request edit access
            </Link>
          )}
        </div>
      </div>

      {!writeEnabled && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can read notes, but you can’t create, pin, or delete them.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}/collaborators`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      )}

      {/* New note form */}
      <section
        id="add-note"
        className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Add a note
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Write in full sentences if it helps future you. Capture who you
              spoke with, what they said, and any deadlines you heard.
            </p>
          </div>
        </div>

        {!writeEnabled && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="font-medium">Read-only mode</p>
              <Link
                href={`/app/estates/${estateId}/collaborators`}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
              >
                Request edit access
              </Link>
            </div>
          </div>
        )}

        <form action={createNote} className="space-y-3 pt-1">
          <input type="hidden" name="estateId" value={estateId} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-200">
              Note text
            </label>
            <textarea
              name="body"
              required
              rows={4}
              placeholder="Example: 4/15 – Spoke with court clerk about upcoming hearing. Need to bring last 6 months of bank statements and a list of creditors."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-500"
              disabled={!writeEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                name="pinned"
                className="h-3 w-3 rounded border-slate-700"
                disabled={!writeEnabled}
              />
              <span>Pin this note to the top</span>
            </label>

            <button
              type="submit"
              disabled={!writeEnabled}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                writeEnabled
                  ? "bg-rose-500 text-slate-950 hover:bg-rose-400"
                  : "cursor-not-allowed bg-slate-800 text-slate-400"
              }`}
            >
              Save note
            </button>
          </div>
        </form>
      </section>

      {/* Filters */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 shadow-sm">
        <form
          method="GET"
          className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label
              htmlFor="q"
              className="whitespace-nowrap text-[11px] text-slate-400"
            >
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search within your notes…"
              className="h-7 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-50 placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-3 md:w-auto">
            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              <input
                type="checkbox"
                name="pinned"
                value="1"
                defaultChecked={showPinnedOnly}
                className="h-3 w-3"
              />
              Pinned only
            </label>

            {hasFilters && (
              <Link
                href={`/app/estates/${estateId}/notes`}
                className="whitespace-nowrap text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* Notes list */}
      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        {notes.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              You haven&apos;t added any notes yet. Start with what&apos;s on your mind—what feels confusing,
              what you&apos;re worried about, or what you need to remember for your next call or court date.
            </p>

            <div className="flex flex-wrap gap-2">
              {writeEnabled ? (
                <Link
                  href="#add-note"
                  className="inline-flex items-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
                >
                  Add your first note
                </Link>
              ) : (
                <Link
                  href={`/app/estates/${estateId}/collaborators`}
                  className="inline-flex items-center rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25"
                >
                  Request edit access
                </Link>
              )}
              <Link
                href={`/app/estates/${estateId}`}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
              >
                Back to overview
              </Link>
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-100">No matches</p>
            <p className="text-sm text-slate-400">No notes match this search or filter.</p>
            {hasFilters ? (
              <Link
                href={`/app/estates/${estateId}/notes`}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/70"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {!writeEnabled ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">Viewer access</p>
                    <p className="text-[11px] text-amber-200">
                      You can view notes, but Edit/Pin/Remove are disabled.
                    </p>
                  </div>
                  <Link
                    href={`/app/estates/${estateId}/collaborators`}
                    className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25 md:mt-0"
                  >
                    Request edit access
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Note
                    </th>
                    <th className="w-48 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Created
                    </th>
                    <th className="w-56 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotes.map((note) => (
                    <tr key={note._id} className="border-t border-slate-800/80 hover:bg-slate-900/60">
                      <td className="px-3 py-2 align-top">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {note.pinned ? (
                              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                                Pinned
                              </span>
                            ) : null}
                            <Link
                              href={`/app/estates/${estateId}/notes/${note._id}`}
                              className="text-sm font-medium text-slate-50 hover:text-emerald-300 underline-offset-2 hover:underline"
                            >
                              {truncate(note.body, 120)}
                            </Link>
                          </div>
                          <p className="text-xs text-slate-400">{truncate(note.body, 240)}</p>
                        </div>
                      </td>

                      <td className="px-3 py-2 align-top text-xs text-slate-400">
                        {note.createdAt ? formatDate(note.createdAt) : ""}
                      </td>

                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          <Link
                            href={`/app/estates/${estateId}/notes/${note._id}`}
                            className="text-slate-300 hover:text-emerald-300 hover:underline"
                          >
                            View
                          </Link>

                          {writeEnabled ? (
                            <Link
                              href={`/app/estates/${estateId}/notes/${note._id}/edit`}
                              className="text-slate-300 hover:text-emerald-300 hover:underline"
                            >
                              Edit
                            </Link>
                          ) : (
                            <span
                              className="cursor-not-allowed text-slate-600"
                              title="Viewer role cannot edit notes"
                            >
                              Edit
                            </span>
                          )}

                          <form action={togglePinned}>
                            <input type="hidden" name="estateId" value={estateId} />
                            <input type="hidden" name="noteId" value={note._id} />
                            <input
                              type="hidden"
                              name="nextPinned"
                              value={note.pinned ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              disabled={!writeEnabled}
                              className={`hover:underline ${
                                writeEnabled
                                  ? "text-slate-300 hover:text-emerald-300"
                                  : "cursor-not-allowed text-slate-600"
                              }`}
                              title={
                                writeEnabled
                                  ? undefined
                                  : "Viewer role cannot pin/unpin notes"
                              }
                            >
                              {note.pinned ? "Unpin" : "Pin"}
                            </button>
                          </form>

                          <form action={deleteNote}>
                            <input type="hidden" name="estateId" value={estateId} />
                            <input type="hidden" name="noteId" value={note._id} />
                            <button
                              type="submit"
                              disabled={!writeEnabled}
                              className={`hover:underline ${
                                writeEnabled
                                  ? "text-rose-400 hover:text-rose-300"
                                  : "cursor-not-allowed text-slate-600"
                              }`}
                              title={
                                writeEnabled
                                  ? undefined
                                  : "Viewer role cannot remove notes"
                              }
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {filteredNotes.map((note) => (
                <div
                  key={note._id}
                  className={`rounded-xl border p-3 ${
                    note.pinned
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-slate-800 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {note.pinned ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                            Pinned
                          </span>
                        ) : null}
                        {note.createdAt ? (
                          <span className="text-[11px] text-slate-500">
                            {formatDate(note.createdAt)}
                          </span>
                        ) : null}
                      </div>

                      <Link
                        href={`/app/estates/${estateId}/notes/${note._id}`}
                        className="mt-1 block text-sm font-medium text-slate-50 hover:text-emerald-300 underline-offset-2 hover:underline"
                      >
                        {truncate(note.body, 140)}
                      </Link>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                        {truncate(note.body, 320)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <Link
                      href={`/app/estates/${estateId}/notes/${note._id}`}
                      className="text-slate-300 hover:text-emerald-300 hover:underline"
                    >
                      View
                    </Link>

                    {writeEnabled ? (
                      <Link
                        href={`/app/estates/${estateId}/notes/${note._id}/edit`}
                        className="text-slate-300 hover:text-emerald-300 hover:underline"
                      >
                        Edit
                      </Link>
                    ) : (
                      <span
                        className="cursor-not-allowed text-slate-600"
                        title="Viewer role cannot edit notes"
                      >
                        Edit
                      </span>
                    )}

                    <form action={togglePinned}>
                      <input type="hidden" name="estateId" value={estateId} />
                      <input type="hidden" name="noteId" value={note._id} />
                      <input
                        type="hidden"
                        name="nextPinned"
                        value={note.pinned ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        disabled={!writeEnabled}
                        className={`hover:underline ${
                          writeEnabled
                            ? "text-slate-300 hover:text-emerald-300"
                            : "cursor-not-allowed text-slate-600"
                        }`}
                        title={
                          writeEnabled
                            ? undefined
                            : "Viewer role cannot pin/unpin notes"
                        }
                      >
                        {note.pinned ? "Unpin" : "Pin"}
                      </button>
                    </form>

                    <form action={deleteNote}>
                      <input type="hidden" name="estateId" value={estateId} />
                      <input type="hidden" name="noteId" value={note._id} />
                      <button
                        type="submit"
                        disabled={!writeEnabled}
                        className={`hover:underline ${
                          writeEnabled
                            ? "text-rose-400 hover:text-rose-300"
                            : "cursor-not-allowed text-slate-600"
                        }`}
                        title={
                          writeEnabled
                            ? undefined
                            : "Viewer role cannot remove notes"
                        }
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}