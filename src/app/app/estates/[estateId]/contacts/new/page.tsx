// src/app/app/estates/[estateId]/contacts/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
import { Contact as ContactModel } from "@/models/Contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ estateId: string }>;
};

type NormalizedRole =
  | "PERSONAL_REPRESENTATIVE"
  | "CREDITOR"
  | "ATTORNEY"
  | "BENEFICIARY";

function normalizeRole(raw: string): NormalizedRole | undefined {
  const r = raw.trim().toLowerCase();
  if (!r) return undefined;

  if (r === "personal representative" || r === "personal rep" || r === "pr") return "PERSONAL_REPRESENTATIVE";
  if (r === "creditor") return "CREDITOR";
  if (r === "attorney" || r === "lawyer") return "ATTORNEY";
  if (r === "heir" || r === "beneficiary") return "BENEFICIARY";

  return undefined;
}

async function createContact(formData: FormData) {
  "use server";

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const estateId = formData.get("estateId");
  if (typeof estateId !== "string" || !estateId.trim()) {
    return;
  }

  const name = (formData.get("name")?.toString() ?? "").trim();
  if (!name) return;

  const roleRaw = (formData.get("role")?.toString() ?? "").trim();
  const category = (formData.get("category")?.toString() ?? "").trim();
  const email = (formData.get("email")?.toString() ?? "").trim();
  const phone = (formData.get("phone")?.toString() ?? "").trim();

  const addressLine1 = (formData.get("addressLine1")?.toString() ?? "").trim();
  const addressLine2 = (formData.get("addressLine2")?.toString() ?? "").trim();
  const city = (formData.get("city")?.toString() ?? "").trim();
  const state = (formData.get("state")?.toString() ?? "").trim();
  const postalCode = (formData.get("postalCode")?.toString() ?? "").trim();
  const country = (formData.get("country")?.toString() ?? "").trim();

  const notes = (formData.get("notes")?.toString() ?? "").trim();

  const normalizedRole = normalizeRole(roleRaw);

  await connectToDatabase();

  const access = await requireEstateAccess({ estateId, userId });
  if (!access?.hasAccess) {
    redirect("/app/estates");
  }

  await ContactModel.create({
    ownerId: userId,
    estateId,
    name,
    role: normalizedRole,
    category: category || undefined,
    email: email || undefined,
    phone: phone || undefined,
    addressLine1: addressLine1 || undefined,
    addressLine2: addressLine2 || undefined,
    city: city || undefined,
    state: state || undefined,
    postalCode: postalCode || undefined,
    country: country || undefined,
    notes: notes || undefined,
  });

  revalidatePath(`/app/estates/${estateId}/contacts`);
  revalidatePath(`/app/estates/${estateId}`);

  redirect(`/app/estates/${estateId}/contacts`);
}

export default async function NewContactPage({ params }: PageProps) {
  const { estateId } = await params;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-gray-500">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:underline">
              Overview
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <Link href={`/app/estates/${estateId}/contacts`} className="hover:underline">
              Contacts
            </Link>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-900">Add</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Add contact</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Keep your estate directory accurate for notices, claims, and follow-ups.
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-col items-start gap-2 text-xs text-gray-500 md:items-end">
          <Link
            href={`/app/estates/${estateId}/contacts`}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Back to contacts
          </Link>
        </div>
      </div>

      <form
        action={createContact}
        className="max-w-2xl space-y-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Basics</h2>
            <p className="mt-1 text-xs text-gray-500">Who is this, and how do they relate to the estate?</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="name" className="text-xs font-medium text-gray-700">
                Name<span className="text-rose-600"> *</span>
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="Full legal name"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
              <p className="text-[11px] text-gray-500">Use the name you or the court would recognize on paper.</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="role" className="text-xs font-medium text-gray-700">
                Role / relationship
              </label>
              <input
                id="role"
                name="role"
                placeholder="Probate attorney, heir, creditor, vendor…"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
              <p className="text-[11px] text-gray-500">Plain language is fine. We’ll map common roles automatically.</p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="category" className="text-xs font-medium text-gray-700">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue=""
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900"
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
            <p className="text-[11px] text-gray-500">Used for quick filters and the category chip.</p>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Contact info</h2>
            <p className="mt-1 text-xs text-gray-500">Optional, but helpful for time-sensitive notices.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className="text-xs font-medium text-gray-700">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                placeholder="(555) 555-5555"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Address</h2>
            <p className="mt-1 text-xs text-gray-500">Use this when you need to mail notices or record service details.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="addressLine1" className="text-xs font-medium text-gray-700">
              Address line 1
            </label>
            <input
              id="addressLine1"
              name="addressLine1"
              placeholder="Street address"
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="addressLine2" className="text-xs font-medium text-gray-700">
              Address line 2
            </label>
            <input
              id="addressLine2"
              name="addressLine2"
              placeholder="Apartment, suite, unit, etc."
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="city" className="text-xs font-medium text-gray-700">
                City
              </label>
              <input
                id="city"
                name="city"
                placeholder="City"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="state" className="text-xs font-medium text-gray-700">
                State
              </label>
              <input
                id="state"
                name="state"
                placeholder="State"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="postalCode" className="text-xs font-medium text-gray-700">
                Postal code
              </label>
              <input
                id="postalCode"
                name="postalCode"
                placeholder="ZIP"
                className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="country" className="text-xs font-medium text-gray-700">
              Country
            </label>
            <input
              id="country"
              name="country"
              placeholder="Country"
              className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
            <p className="mt-1 text-xs text-gray-500">Keep context you’ll want later.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="notes" className="text-xs font-medium text-gray-700">
              Internal notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Claim ID, bar number, best time to call, relationship context…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
            />
            <p className="text-[11px] text-gray-500">Visible to collaborators with access to this estate.</p>
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-gray-500">You can edit or remove this contact later.</p>

          <div className="flex items-center gap-3">
            <Link
              href={`/app/estates/${estateId}/contacts`}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
            >
              Save contact
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}