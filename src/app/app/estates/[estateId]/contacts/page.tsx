// src/app/app/estates/[estateId]/contacts/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "../../../../../lib/db";
import { Contact as ContactModel } from "../../../../../models/Contact";

interface ContactDoc {
  _id: unknown;
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  category?: string;
}

interface ContactItem {
  _id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  category?: string;
}

async function fetchContacts(estateId: string): Promise<ContactItem[]> {
  await connectToDatabase();

  const docs = await ContactModel.find({ estateId })
    .sort({ name: 1 })
    .lean<ContactDoc[]>();

  return (docs ?? []).map((doc) => ({
    _id: String(doc._id),
    name: doc.name ?? "",
    role: doc.role ?? undefined,
    email: doc.email ?? undefined,
    phone: doc.phone ?? undefined,
    notes: doc.notes ?? undefined,
    category: doc.category ?? undefined,
  }));
}

async function deleteContact(formData: FormData) {
  "use server";

  const contactId = formData.get("contactId");
  const estateId = formData.get("estateId");

  if (typeof contactId !== "string" || typeof estateId !== "string") {
    return;
  }

  await connectToDatabase();

  await ContactModel.findOneAndDelete({
    _id: contactId,
    estateId,
  });

  revalidatePath(`/app/estates/${estateId}/contacts`);
}

interface PageProps {
  params: { estateId: string };
}

export default async function EstateContactsPage({ params }: PageProps) {
  const { estateId } = params;

  if (!estateId) {
    notFound();
  }

  const contacts = await fetchContacts(estateId);

  return (
    <div className="space-y-6 p-6">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">Estates</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Current estate</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Contacts</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Estate directory
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Keep every key person for this estate in one place – attorneys,
              heirs, tenants, vendors, court contacts, and more. Think of it as
              your probate phone book.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Estate directory
          </span>
          <Link
            href={`/app/estates/${estateId}/contacts/new`}
            className="inline-flex items-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 shadow-sm hover:bg-rose-400"
          >
            Add contact
          </Link>
        </div>
      </div>

      {/* Empty state vs cards */}
      {contacts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
          No contacts recorded yet. Start by adding your probate attorney,
          heirs, and any creditors, tenants, or vendors you&apos;re dealing with
          for this estate.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              People connected to this estate
            </h2>
            <p className="text-[11px] text-slate-500">
              Use this directory when you&apos;re on the phone with the court or
              tracking who&apos;s been notified.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contacts.map((c) => (
              <article
                key={c._id}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm shadow-slate-950/40 transition hover:border-rose-700 hover:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-medium text-slate-50">
                      {c.name || "Unnamed contact"}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {c.role && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 uppercase tracking-wide text-slate-300">
                          {c.role}
                        </span>
                      )}
                      {c.category && (
                        <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-100">
                          {c.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Link
                      href={`/app/estates/${estateId}/contacts/${c._id}`}
                      className="text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
                    >
                      Edit
                    </Link>

                    <form action={deleteContact}>
                      <input type="hidden" name="contactId" value={c._id} />
                      <input type="hidden" name="estateId" value={estateId} />
                      <button
                        type="submit"
                        className="text-rose-400 underline-offset-2 hover:text-rose-300 hover:underline"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  {c.email && (
                    <p className="text-slate-200">
                      <span className="font-medium text-slate-300">Email: </span>
                      <a
                        href={`mailto:${c.email}`}
                        className="underline-offset-2 hover:text-emerald-300 hover:underline"
                      >
                        {c.email}
                      </a>
                    </p>
                  )}

                  {c.phone && (
                    <p className="text-slate-200">
                      <span className="font-medium text-slate-300">Phone: </span>
                      <a
                        href={`tel:${c.phone}`}
                        className="underline-offset-2 hover:text-emerald-300 hover:underline"
                      >
                        {c.phone}
                      </a>
                    </p>
                  )}

                  {c.notes && (
                    <p className="mt-1 text-xs text-slate-400">{c.notes}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
