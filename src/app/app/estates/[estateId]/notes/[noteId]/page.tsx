import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Types } from "mongoose";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess, requireEstateEditAccess } from "@/lib/estateAccess";
import { EstateNote } from "@/models/EstateNote";

export const metadata = {
  title: "Note | LegatePro",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RawNote = {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId | string;
  estateId: Types.ObjectId | string;
  subject?: string;
  body: string;
  category?: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    const maybe = (value as { toString?: () => string }).toString?.();
    if (typeof maybe === "string") {
      const d = new Date(maybe);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function formatDateTime(value: unknown): string {
  const d = coerceDate(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadNote(
  estateId: string,
  noteId: string
): Promise<RawNote | null> {
  await connectToDatabase();

  // Estate-scoped note: access is enforced by `requireEstateAccess`.
  const note = await EstateNote.findOne({
    _id: noteId,
    estateId,
  }).lean<RawNote | null>();

  return note;
}

export default async function NoteDetailPage({ params, searchParams }: PageProps) {
  const { estateId, noteId } = await params;

  const sp = searchParams ? await searchParams : undefined;
  const forbidden = sp?.forbidden === "1";

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  const note = await loadNote(estateId, noteId);

  if (!note) {
    notFound();
  }

  async function deleteNote() {
    "use server";

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      redirect("/login");
    }
    const editAccess = await requireEstateEditAccess({ estateId, userId: innerSession.user.id });
    if (editAccess.role === "VIEWER") {
      redirect(`/app/estates/${estateId}/notes?forbidden=1`);
    }
    await connectToDatabase();
    await EstateNote.findOneAndDelete({
      _id: noteId,
      estateId,
    });
    revalidatePath(`/app/estates/${estateId}/notes`);
    revalidatePath(`/app/estates/${estateId}/notes/${noteId}`);
    redirect(`/app/estates/${estateId}/notes?deleted=1`);
  }

  const createdAt = formatDateTime(note.createdAt);
  const updatedAt = formatDateTime(note.updatedAt);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
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
          href={`/app/estates/${estateId}/notes`}
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Notes
        </Link>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">View</span>
      </nav>
      {forbidden && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Action blocked</p>
              <p className="text-xs text-rose-200">
                You don’t have edit permissions for this estate. Request access from the owner to edit or delete notes.
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
      )}
      {!canEdit && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view notes, but you can’t edit or delete them.
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
      )}
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-50">
              {(note.subject ?? "").trim() ? note.subject : "Untitled note"}
            </h1>
            {note.isPinned && (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                Pinned
              </span>
            )}
            {note.category && (
              <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
                {note.category.toLowerCase()}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Created <span className="font-medium text-slate-200">{createdAt}</span>
            {updatedAt !== createdAt && (
              <>
                {" • Updated "}
                <span className="font-medium text-slate-200">{updatedAt}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/notes`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-rose-700 hover:text-rose-200"
          >
            ← Back to notes
          </Link>

          {canEdit ? (
            <>
              <Link
                href={`/app/estates/${estateId}/notes/${noteId}/edit`}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-50 shadow-sm hover:bg-slate-700"
              >
                Edit note
              </Link>
              <form action={deleteNote}>
                <button
                  type="submit"
                  className="rounded-lg border border-rose-900/60 bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/60 hover:text-rose-50"
                >
                  Delete note
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-100 shadow-sm shadow-rose-950/40">
        {(note.body ?? "").trim() ? (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
            {note.body}
          </pre>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">This note doesn’t have any content yet.</p>
            {canEdit ? (
              <div>
                <Link
                  href={`/app/estates/${estateId}/notes/${noteId}/edit`}
                  className="inline-flex items-center rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-50 shadow-sm hover:bg-slate-700"
                >
                  Add content
                </Link>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Editing is disabled for viewer access.</p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}