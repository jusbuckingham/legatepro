import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact, type ContactRole } from "@/models/Contact";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

async function createContact(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const name = formData.get("name");
  const relationship = formData.get("relationship");
  const role = formData.get("role");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const notes = formData.get("notes");

  if (typeof estateId !== "string") {
    return;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts`);
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    redirect(`/app/estates/${estateId}/contacts`);
  }

  await connectToDatabase();

  await Contact.create({
    ownerId: session.user.id,
    estateId,
    name: name.trim(),
    relationship:
      typeof relationship === "string" ? relationship.trim() : undefined,
    role: typeof role === "string" && role.length > 0 ? role : undefined,
    email: typeof email === "string" ? email.trim() : undefined,
    phone: typeof phone === "string" ? phone.trim() : undefined,
    notes: typeof notes === "string" ? notes.trim() : undefined,
    isPrimary: false,
  });

  redirect(`/app/estates/${estateId}/contacts`);
}

export default async function EstateContactsPage({ params }: PageProps) {
  const { estateId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts`);
  }

  await connectToDatabase();

  type RawContact = {
    _id: unknown;
    name?: string;
    relationship?: string;
    role?: ContactRole;
    email?: string;
    phone?: string;
  };

  const rawContacts = (await Contact.find({
    estateId,
    ownerId: session.user.id,
  })
    .sort({ name: 1 })
    .lean()) as RawContact[];

  type ContactListItem = {
    _id: string;
    name: string;
    relationship?: string;
    role?: ContactRole;
    email?: string;
    phone?: string;
  };

  const contacts: ContactListItem[] = rawContacts.map((contact) => ({
    _id: String(contact._id),
    name: contact.name ?? "",
    relationship: contact.relationship,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Estate contacts
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            People & relationships
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Track heirs, beneficiaries, attorneys, and other key people linked
            to this estate.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}`}
          className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
        >
          Back to estate overview
        </Link>
      </div>

      {/* Create contact form */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Add a new contact
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          At minimum, add a name. Relationship and contact details are optional
          but recommended.
        </p>

        <form action={createContact} className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <input type="hidden" name="estateId" value={estateId} />

          <div className="sm:col-span-1">
            <label
              htmlFor="name"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Name *
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              placeholder="e.g. Alicia Buckingham"
            />
          </div>

          <div className="sm:col-span-1">
            <label
              htmlFor="relationship"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Relationship
            </label>
            <input
              id="relationship"
              name="relationship"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              placeholder="e.g. Daughter, Attorney, Heir"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Role
            </label>
            <select
              id="role"
              name="role"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 focus:border-emerald-500"
              defaultValue=""
            >
              <option value="">Select a role</option>
              <option value="HEIR">Heir</option>
              <option value="BENEFICIARY">Beneficiary</option>
              <option value="ATTORNEY">Attorney</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="EXECUTOR">Executor</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              placeholder="(555) 555-5555"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="notes"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              placeholder="Key details, case notes, preferences, etc."
            />
          </div>

          <div className="sm:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg border border-emerald-500/70 bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/40 hover:bg-emerald-500"
            >
              Add contact
            </button>
          </div>
        </form>
      </section>

      {/* Contacts list */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">All contacts</h2>

        {contacts.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            No contacts yet. Add your first contact using the form above.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
            <table className="min-w-full divide-y divide-slate-800 text-xs">
              <thead className="bg-slate-950/80">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-400">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-400">
                    Relationship
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-400">
                    Role
                  </th>
                  <th className="hidden px-3 py-2 text-left font-semibold text-slate-400 sm:table-cell">
                    Contact
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {contacts.map((contact) => (
                  <tr key={contact._id.toString()}>
                    <td className="px-3 py-2 text-slate-100">
                      {contact.name}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {contact.relationship || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {contact.role ?? "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-slate-300 sm:table-cell">
                      {contact.email || contact.phone || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/app/estates/${estateId}/contacts/${contact._id.toString()}`}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                        >
                          View
                        </Link>
                        <Link
                          href={`/app/estates/${estateId}/contacts/${contact._id.toString()}/edit`}
                          className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}