import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact, type ContactDocument } from "@/models/Contact";

interface PageProps {
  params: Promise<{
    estateId: string;
    contactId: string;
  }>;
}

async function deleteContact(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const contactId = formData.get("contactId");

  if (typeof estateId !== "string" || typeof contactId !== "string") {
    return;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts/${contactId}`);
  }

  await connectToDatabase();

  await Contact.findOneAndDelete({
    _id: contactId,
    estateId,
    ownerId: session.user.id,
  });

  redirect(`/app/estates/${estateId}/contacts`);
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { estateId, contactId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts/${contactId}`);
  }

  await connectToDatabase();

  const contact = await Contact.findOne({
    _id: contactId,
    estateId,
    ownerId: session.user.id,
  }).lean<ContactDocument | null>();

  if (!contact) {
    notFound();
  }

  const createdAt = contact.createdAt
    ? new Date(contact.createdAt).toLocaleString()
    : "";
  const updatedAt = contact.updatedAt
    ? new Date(contact.updatedAt).toLocaleString()
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Contact
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            {contact.name}
          </h1>
          <p className="text-xs text-slate-400">
            Added {createdAt}
            {updatedAt && createdAt !== updatedAt
              ? ` · Updated ${updatedAt}`
              : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 text-xs sm:justify-end">
          <Link
            href={`/app/estates/${estateId}/contacts`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to contacts
          </Link>
          <Link
            href={`/app/estates/${estateId}/contacts/${contactId}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm shadow-black/40 hover:bg-slate-800"
          >
            Edit
          </Link>
          <form action={deleteContact} className="inline-flex">
            <input type="hidden" name="estateId" value={estateId} />
            <input type="hidden" name="contactId" value={contactId} />
            <button
              type="submit"
              className="inline-flex items-center rounded-lg border border-red-500/70 bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-100 shadow-sm shadow-black/40 hover:bg-red-700/70"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Contact details
          </h2>

          <dl className="grid grid-cols-1 gap-3 text-xs text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Relationship</dt>
              <dd className="font-medium">
                {contact.relationship || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium">{contact.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium">{contact.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium">{contact.phone || "—"}</dd>
            </div>
          </dl>

          <div className="space-y-2 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notes
            </h3>
            <p className="whitespace-pre-wrap text-sm text-slate-200">
              {contact.notes || "No notes added yet."}
            </p>
          </div>
        </section>

        <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Address & metadata
          </h2>
          <div className="space-y-3 text-xs text-slate-300">
            <div>
              <p className="text-slate-500">Address</p>
              <p className="mt-1 whitespace-pre-line text-slate-200">
                {contact.addressLine1 || contact.addressLine2
                  ? [
                      contact.addressLine1,
                      contact.addressLine2,
                      [contact.city, contact.state]
                        .filter(Boolean)
                        .join(", "),
                      contact.postalCode,
                      contact.country,
                    ]
                      .filter((line) => Boolean(line && line.toString().trim()))
                      .join("\n")
                  : "—"}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
              <p>Contact ID: {contactId}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}