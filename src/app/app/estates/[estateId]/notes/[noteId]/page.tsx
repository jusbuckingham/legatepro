import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateNote, NoteCategory } from "@/models/EstateNote";
import type { Types } from "mongoose";

export const metadata = {
  title: "Note | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
    noteId: string;
  }>;
};

type RawNote = {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId | string;
  estateId: Types.ObjectId | string;
  subject: string;
  body: string;
  category?: NoteCategory;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

async function loadNote(
  estateId: string,
  noteId: string,
  userId: string
): Promise<RawNote | null> {
  await connectToDatabase();

  const note = await EstateNote.findOne({
    _id: noteId,
    estateId,
    ownerId: userId,
  }).lean<RawNote | null>();

  return note;
}

export default async function NoteDetailPage({ params }: PageProps) {
  const { estateId, noteId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const note = await loadNote(estateId, noteId, session.user.id);

  if (!note) {
    notFound();
  }

  async function deleteNote() {
    "use server";

    const innerSession = await auth();
    if (!innerSession?.user?.id) {
      redirect("/login");
    }

    await connectToDatabase();

    await EstateNote.findOneAndDelete({
      _id: noteId,
      estateId,
      ownerId: innerSession.user.id,
    });

    redirect(`/app/estates/${estateId}/notes`);
  }

  const createdAt = note.createdAt.toLocaleString();
  const updatedAt = note.updatedAt.toLocaleString();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-50">
              {note.subject}
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
        </div>
      </div>

      <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-100 shadow-sm shadow-rose-950/40">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
          {note.body}
        </pre>
      </article>
    </div>
  );
}