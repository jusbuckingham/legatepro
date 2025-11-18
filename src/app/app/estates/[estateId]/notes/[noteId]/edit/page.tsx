import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { EstateNote, NoteCategory } from "@/models/EstateNote";
import type { Types } from "mongoose";

export const metadata = {
  title: "Edit Note | LegatePro",
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

export default async function EditNotePage({ params }: PageProps) {
  const { estateId, noteId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const note = await loadNote(estateId, noteId, session.user.id);
  if (!note) {
    notFound();
  }

  async function updateNote(formData: FormData) {
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
      redirect(`/app/estates/${estateId}/notes/${noteId}/edit`);
    }

    await EstateNote.findOneAndUpdate(
      {
        _id: noteId,
        estateId,
        ownerId: session.user.id,
      },
      {
        subject: String(subject),
        body: String(body),
        category: category ?? "GENERAL",
        isPinned,
      },
      { new: true }
    );

    redirect(`/app/estates/${estateId}/notes/${noteId}`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">
            Edit note
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Update the subject, body, or category for this note.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/notes/${noteId}`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-rose-700 hover:text-rose-200"
          >
            ← Back to note
          </Link>
          <Link
            href={`/app/estates/${estateId}/notes`}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-rose-700/70 hover:text-rose-200"
          >
            All notes
          </Link>
        </div>
      </div>

      <form
        action={updateNote}
        className="max-w-2xl space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
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
            defaultValue={note.subject}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 outline-none ring-rose-700/30 placeholder:text-slate-500 focus:border-rose-600 focus:ring-2"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="body" className="text-xs font-medium text-slate-200">
            Body
          </label>
          <textarea
            id="body"
            name="body"
            defaultValue={note.body}
            required
            rows={8}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-rose-700/30 placeholder:text-slate-500 focus:border-rose-600 focus:ring-2"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
              defaultValue={note.category ?? "GENERAL"}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-700/50"
            >
              <option value="GENERAL">General</option>
              <option value="LEGAL">Legal</option>
              <option value="FINANCIAL">Financial</option>
              <option value="COMMUNICATION">Communication</option>
            </select>
          </div>

          <label className="mt-5 flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              name="isPinned"
              defaultChecked={note.isPinned}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-600"
            />
            Pin this note
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href={`/app/estates/${estateId}/notes/${noteId}`}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-slate-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow shadow-rose-900/50 transition hover:bg-rose-500"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}