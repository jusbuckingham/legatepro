// src/app/app/estates/[estateId]/contacts/[contactId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "../../../../../../lib/db";
import { Contact as ContactModel } from "../../../../../../models/Contact";

interface PageProps {
  params: {
    estateId: string;
    contactId: string;
  };
}

interface ContactDoc {
  _id: unknown;
  estateId: unknown;
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  category?: string;
}

async function loadContact(
  estateId: string,
  contactId: string
): Promise<ContactDoc | null> {
  await connectToDatabase();

  const doc = await ContactModel.findOne({
    _id: contactId,
    estateId,
  }).lean<ContactDoc | null>();

  return doc;
}

async function updateContact(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  const contactId = formData.get("contactId");

  if (typeof estateId !== "string" || typeof contactId !== "string") {
    return;
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const role = formData.get("role")?.toString().trim() || "";
  const category = formData.get("category")?.toString().trim() || "";
  const email = formData.get("email")?.toString().trim() || "";
  const phone = formData.get("phone")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";

  if (!name) {
    // Must have a name; silently ignore if omitted
    return;
  }

  await connectToDatabase();

  await ContactModel.findOneAndUpdate(
    { _id: contactId, estateId },
    {
      name,
      role: role || undefined,
      category: category || undefined,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
    },
    { new: true }
  );

  revalidatePath(`/app/estates/${estateId}/contacts`);
  redirect(`/app/estates/${estateId}/contacts`);
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { estateId, contactId } = params;

  if (!estateId || !contactId) {
    notFound();
  }

  const contact = await loadContact(estateId, contactId);

  if (!contact) {
    notFound();
  }

  const name = contact.name ?? "";
  const role = contact.role ?? "";
  const email = contact.email ?? "";
  const phone = contact.phone ?? "";
  const notes = contact.notes ?? "";
  const category = contact.category ?? "";

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
            <Link
              href={`/app/estates/${estateId}/contacts`}
              className="text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
            >
              Contacts
            </Link>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-rose-300">Edit</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Edit contact
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Update details for this person. This is often your probate
              attorney, heirs, creditors, court contacts, tenants, or key
              vendors you&apos;re dealing with.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Changes here only affect this estate&apos;s directory.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Estate directory
          </span>
          {category && (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-950/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-100">
              {category}
            </span>
          )}
          <Link
            href={`/app/estates/${estateId}/contacts`}
            className="mt-1 text-[11px] text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Back to contacts
          </Link>
        </div>
      </div>

      {/* Edit form */}
      <form
        action={updateContact}
        className="max-w-xl space-y-4 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <input type="hidden" name="estateId" value={estateId} />
        <input type="hidden" name="contactId" value={contactId} />

        <div className="space-y-1">
          <label
            htmlFor="name"
            className="text-xs font-medium text-slate-200"
          >
            Name<span className="text-rose-400"> *</span>
          </label>
          <input
            id="name"
            name="name"
            defaultValue={name}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="Full name"
          />
          <p className="text-[11px] text-slate-500">
            Use the name you or the court would recognize on paper.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="role"
            className="text-xs font-medium text-slate-200"
          >
            Role / relationship
          </label>
          <input
            id="role"
            name="role"
            defaultValue={role}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="Probate attorney, heir, creditor, vendor, etc."
          />
          <p className="text-[11px] text-slate-500">
            How this person relates to the estate in plain language.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="category"
            className="text-xs font-medium text-slate-200"
          >
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category || ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
          >
            <option value="">Select a category (optional)</option>
            <option value="Attorney">Attorney</option>
            <option value="Heir / Beneficiary">Heir / Beneficiary</option>
            <option value="Tenant">Tenant</option>
            <option value="Creditor">Creditor</option>
            <option value="Vendor / Contractor">Vendor / Contractor</option>
            <option value="Court contact">Court contact</option>
            <option value="Other">Other</option>
          </select>
          <p className="text-[11px] text-slate-500">
            This powers the small category chip on the estate directory cards.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-xs font-medium text-slate-200"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="phone"
              className="text-xs font-medium text-slate-200"
            >
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              defaultValue={phone}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="notes"
            className="text-xs font-medium text-slate-200"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={notes}
            rows={4}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="Bar number, claim ID, retainer details, best time to call, or relationship context."
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
          <p className="text-[11px] text-slate-500">
            Changes are saved for this estate&apos;s workspace only.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={`/app/estates/${estateId}/contacts`}
              className="text-[11px] text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-rose-400"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}