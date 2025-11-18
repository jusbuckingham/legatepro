import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateNote, NoteCategory } from "@/models/EstateNote";
import type { Types } from "mongoose";

export const metadata = {
  title: "Estate Notes | LegatePro",
};

type PageProps = {
  params: Promise<{
    estateId: string;
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

type NoteListItem = {
  id: string;
  subject: string;
  body: string;
  category?: NoteCategory;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export default async function EstateNotesPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const noteDocs = await EstateNote.find({
    estateId,
    ownerId: session.user.id,
  })
    .sort({ isPinned: -1, createdAt: -1 })
    .lean<RawNote[]>();

  const notes: NoteListItem[] = noteDocs.map((doc: RawNote) => ({
    id: doc._id.toString(),
    subject: doc.subject,
    body: doc.body,
    category: doc.category,
    isPinned: doc.isPinned,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));

  async function createNote(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user?.id) {
      redirect("/login");
    }

    await connectToDatabase();

    const subject = formData.get("subject");
    const body = formData.get("body");
    const category = formData.get("category") as NoteCategory | null;
    const isPinned = formData.get("isPinned") === "on";

    if (!subject || !body) {
      // Basic guard; in a real UI you'd show validation errors.
      redirect(`/app/estates/${estateId}/notes`);
    }

    await EstateNote.create({
      ownerId: session.user.id,
      estateId,
      subject: String(subject),
      body: String(body),
      category: category ?? "GENERAL",
      isPinned,
    });

    redirect(`/app/estates/${estateId}/notes`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">
            Estate Notes
          </h1>
          <p className="text-sm text-slate-400">
            Capture key updates, phone call summaries, and reminders tied to
            this estate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/app/estates/${estateId}`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-rose-700 hover:text-rose-200"
          >
            ← Back to estate overview
          </Link>
        </div>
      </div>

      {/* Quick add form */}
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-rose-950/40 md:grid-cols-[2fr,3fr]">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Quick note
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Jot down a quick update or reminder. Use pinned notes to keep
            something at the top.
          </p>
        </div>
        <form action={createNote} className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="subject"
              className="text-xs font-medium text-slate-200"
            >
              Subject
            </label>
            <input
              id="subject"
              name="subject"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 outline-none ring-rose-700/30 placeholder:text-slate-500 focus:border-rose-600 focus:ring-2"
              placeholder="Call with attorney, status update, etc."
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="body"
              className="text-xs font-medium text-slate-200"
            >
              Details
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={3}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 outline-none ring-rose-700/30 placeholder:text-slate-500 focus:border-rose-600 focus:ring-2"
              placeholder="Write a brief summary of the update..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="category"
                className="text-xs font-medium text-slate-200"
              >
                Category
              </label>
              <select
                id="category"
                name="category"
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-700/50"
                defaultValue="GENERAL"
              >
                <option value="GENERAL">General</option>
                <option value="LEGAL">Legal</option>
                <option value="FINANCIAL">Financial</option>
                <option value="COMMUNICATION">Communication</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                name="isPinned"
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-600"
              />
              Pin this note
            </label>

            <button
              type="submit"
              className="ml-auto rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow shadow-rose-900/50 transition hover:bg-rose-500"
            >
              Add note
            </button>
          </div>
        </form>
      </section>

      {/* Notes list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            All notes ({notes.length})
          </h2>
        </div>

        {notes.length === 0 ? (
          <p className="text-xs text-slate-400">
            No notes yet. Use the form above to capture your first update.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <article
                key={note.id}
                className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 transition hover:border-rose-800/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-50">
                        {note.subject}
                      </h3>
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
                    <p className="mt-1 line-clamp-3 text-xs text-slate-300">
                      {note.body}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href={`/app/estates/${estateId}/notes/${note.id}`}
                        className="text-[11px] font-medium text-rose-300 hover:text-rose-200"
                      >
                        View
                      </Link>
                      <span className="text-slate-700">•</span>
                      <Link
                        href={`/app/estates/${estateId}/notes/${note.id}/edit`}
                        className="text-[11px] font-medium text-slate-300 hover:text-slate-100"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}