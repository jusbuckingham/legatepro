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

async function updateContact(formData: FormData): Promise<void> {
  "use server";

  const estateId = formData.get("estateId");
  const contactId = formData.get("contactId");

  if (typeof estateId !== "string" || typeof contactId !== "string") {
    return;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts/${contactId}/edit`);
  }

  const name = formData.get("name");
  const relationship = formData.get("relationship");
  const role = formData.get("role");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const addressLine1 = formData.get("addressLine1");
  const addressLine2 = formData.get("addressLine2");
  const city = formData.get("city");
  const state = formData.get("state");
  const postalCode = formData.get("postalCode");
  const country = formData.get("country");
  const notes = formData.get("notes");

  const updates: Record<string, unknown> = {};

  if (typeof name === "string" && name.trim().length > 0) {
    updates.name = name.trim();
  }

  if (typeof relationship === "string") {
    updates.relationship = relationship.trim();
  }

  if (typeof role === "string" && role.length > 0) {
    updates.role = role;
  }

  if (typeof email === "string") {
    updates.email = email.trim();
  }

  if (typeof phone === "string") {
    updates.phone = phone.trim();
  }

  if (typeof addressLine1 === "string") {
    updates.addressLine1 = addressLine1.trim();
  }

  if (typeof addressLine2 === "string") {
    updates.addressLine2 = addressLine2.trim();
  }

  if (typeof city === "string") {
    updates.city = city.trim();
  }

  if (typeof state === "string") {
    updates.state = state.trim();
  }

  if (typeof postalCode === "string") {
    updates.postalCode = postalCode.trim();
  }

  if (typeof country === "string") {
    updates.country = country.trim();
  }

  if (typeof notes === "string") {
    updates.notes = notes.trim();
  }

  await connectToDatabase();

  await Contact.findOneAndUpdate(
    {
      _id: contactId,
      estateId,
      ownerId: session.user.id,
    },
    updates,
  );

  redirect(`/app/estates/${estateId}/contacts/${contactId}`);
}

export default async function EditContactPage({ params }: PageProps) {
  const { estateId, contactId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/app/estates/${estateId}/contacts/${contactId}/edit`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Edit contact
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            {contact.name}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Update relationship, contact info, and notes.
          </p>
        </div>

        <Link
          href={`/app/estates/${estateId}/contacts/${contactId}`}
          className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
        >
          Cancel
        </Link>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <form className="grid gap-3 text-xs sm:grid-cols-2" action={updateContact}>
          <input type="hidden" name="estateId" value={estateId} />
          <input type="hidden" name="contactId" value={contactId} />

          <div className="sm:col-span-1">
            <label
              htmlFor="name"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={contact.name}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
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
              defaultValue={contact.relationship || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
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
              defaultValue={contact.role ?? ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 focus:border-emerald-500"
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
              defaultValue={contact.email || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
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
              defaultValue={contact.phone || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="addressLine1"
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
              >
                Address line 1
              </label>
              <input
                id="addressLine1"
                name="addressLine1"
                defaultValue={contact.addressLine1 || ""}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="addressLine2"
                className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
              >
                Address line 2
              </label>
              <input
                id="addressLine2"
                name="addressLine2"
                defaultValue={contact.addressLine2 || ""}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="city"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={contact.city || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="state"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              State
            </label>
            <input
              id="state"
              name="state"
              defaultValue={contact.state || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="postalCode"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Postal code
            </label>
            <input
              id="postalCode"
              name="postalCode"
              defaultValue={contact.postalCode || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="country"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400"
            >
              Country
            </label>
            <input
              id="country"
              name="country"
              defaultValue={contact.country || ""}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
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
              defaultValue={contact.notes || ""}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg border border-emerald-500/70 bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-black/40 hover:bg-emerald-500"
            >
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}