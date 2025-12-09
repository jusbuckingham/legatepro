import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateNote } from "@/models/EstateNote";

export const dynamic = "force-dynamic";

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

  await connectToDatabase();

  const pinned = pinnedRaw === "on" || pinnedRaw === "true" || pinnedRaw === "1";

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

  await connectToDatabase();

  const nextPinned =
    nextPinnedRaw === "true" || nextPinnedRaw === "1" || nextPinnedRaw === "on";

  await EstateNote.findOneAndUpdate(
    { _id: noteId, estateId, ownerId: session.user.id },
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

  await connectToDatabase();

  await EstateNote.findOneAndDelete({
    _id: noteId,
    estateId,
    ownerId: session.user.id,
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

  await connectToDatabase();

  const docs = (await EstateNote.find(
    { estateId, ownerId: session.user.id },
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
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link
              href={`/app/estates/${estateId}`}
              className="hover:underline"
            >
              Overview
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-900">Notes</span>
          </nav>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Notes for this estate
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Use notes to capture conversations, ideas, questions, and
              reminders that don&apos;t belong in invoices or documents.
              Everything here is private to you.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-end gap-1 text-xs text-gray-500">
          <div>
            <span className="font-medium">{notes.length}</span> note
            {notes.length === 1 ? "" : "s"}
            {pinnedCount > 0 && (
              <>
                {" "}
                · <span className="font-medium">{pinnedCount}</span> pinned
              </>
            )}
          </div>
          <span className="text-[11px] text-gray-400">
            Notes are not shared with the court or other parties.
          </span>
        </div>
      </div>

      {/* New note form */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Add note
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Jot down what&apos;s on your mind about this estate—calls you
              made, advice you received, or next steps.
            </p>
          </div>
        </div>

        <form action={createNote} className="space-y-3 pt-1">
          <input type="hidden" name="estateId" value={estateId} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-800">
              Note text
            </label>
            <textarea
              name="body"
              required
              rows={4}
              placeholder="Example: Spoke with court clerk about upcoming hearing; they recommended bringing bank statements for the last 3 months."
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                name="pinned"
                className="h-3 w-3 rounded border-gray-300"
              />
              <span>Pin this note to the top</span>
            </label>

            <button
              type="submit"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Save note
            </button>
          </div>
        </form>
      </section>

      {/* Filters */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <form
          method="GET"
          className="flex flex-col gap-2 text-xs md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-1 items-center gap-2">
            <label
              htmlFor="q"
              className="whitespace-nowrap text-[11px] text-gray-500"
            >
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search notes…"
              className="h-7 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center gap-3 md:w-auto">
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
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
              <a
                href={`/app/estates/${estateId}/notes`}
                className="whitespace-nowrap text-[11px] text-gray-500 hover:text-gray-800"
              >
                Clear filters
              </a>
            )}
          </div>
        </form>
      </section>

      {/* Notes list */}
      <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">
            You haven&apos;t added any notes yet. Start with what&apos;s
            bothering you the most about this estate, or what you&apos;re
            planning to do next.
          </p>
        ) : filteredNotes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No notes match this search or filter.
          </p>
        ) : (
          <ul className="space-y-3">
            {filteredNotes.map((note) => (
              <li
                key={note._id}
                className={`rounded-md border p-3 text-sm ${
                  note.pinned
                    ? "border-yellow-200 bg-yellow-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {note.pinned && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-800">
                        Pinned
                      </span>
                    )}
                    {note.createdAt && (
                      <span className="text-[11px] text-gray-500">
                        {formatDate(note.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
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
                        className="text-gray-700 hover:underline"
                      >
                        {note.pinned ? "Unpin" : "Pin"}
                      </button>
                    </form>
                    <form action={deleteNote}>
                      <input type="hidden" name="estateId" value={estateId} />
                      <input type="hidden" name="noteId" value={note._id} />
                      <button
                        type="submit"
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-900">
                  {truncate(note.body, 1000)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}