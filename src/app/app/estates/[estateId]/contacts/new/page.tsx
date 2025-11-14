// src/app/app/estates/[estateId]/contacts/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "../../../../../../lib/db";
import { Contact as ContactModel } from "../../../../../../models/Contact";

interface PageProps {
  params: {
    estateId: string;
  };
}

async function createContact(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId");
  if (typeof estateId !== "string" || !estateId) {
    return;
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const role = formData.get("role")?.toString().trim() || "";
  const category = formData.get("category")?.toString().trim() || "";
  const email = formData.get("email")?.toString().trim() || "";
  const phone = formData.get("phone")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";

  if (!name) {
    // Require a name; no-op if missing
    return;
  }

  await connectToDatabase();

  await ContactModel.create({
    estateId,
    name,
    role: role || undefined,
    category: category || undefined,
    email: email || undefined,
    phone: phone || undefined,
    notes: notes || undefined,
  });

  revalidatePath(`/app/estates/${estateId}/contacts`);
  redirect(`/app/estates/${estateId}/contacts`);
}

export default function NewContactPage({ params }: PageProps) {
  const { estateId } = params;

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
            <span className="text-rose-300">New</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Add contact
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Create a new contact for this estate. This could be an attorney,
              heir, creditor, insurance representative, tenant, vendor, or any
              other key person you&apos;re working with.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100 shadow-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
            Estate directory
          </span>

          <Link
            href={`/app/estates/${estateId}/contacts`}
            className="text-[11px] text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Back to contacts
          </Link>
        </div>
      </div>

      {/* Form */}
      <form
        action={createContact}
        className="max-w-xl space-y-4 rounded-xl border border-rose-900/40 bg-slate-950/70 p-4 shadow-sm shadow-rose-950/40"
      >
        <input type="hidden" name="estateId" value={estateId} />

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
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="Probate attorney, heir, creditor, vendor, court clerk, etc."
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
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            defaultValue=""
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
            This powers the small category chip you see on the directory cards.
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
            rows={4}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-rose-400"
            placeholder="Bar number, claim ID, retainer details, best time to call, or relationship context."
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs md:flex-row md:items-center md:justify-between">
          <p className="text-[11px] text-slate-500">
            This contact will only be visible inside this estate&apos;s workspace.
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
              Save contact
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}