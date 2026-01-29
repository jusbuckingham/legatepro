import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";

type PageProps = {
  params: Promise<{
    estateId: string;
    contactId: string;
  }>;
};

type ContactDoc = {
  _id: string;
  ownerId: string;
  estateId: string;
  name: string;
  relationship?: string;
  role?: "PERSONAL_REPRESENTATIVE" | "BENEFICIARY" | "CREDITOR" | "ATTORNEY" | "OTHER";
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function formatDate(value: Date | string | undefined): string {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function roleLabel(role?: ContactDoc["role"]): string {
  if (!role) return "Unspecified";
  switch (role) {
    case "PERSONAL_REPRESENTATIVE":
      return "Personal Representative";
    case "BENEFICIARY":
      return "Beneficiary";
    case "CREDITOR":
      return "Creditor";
    case "ATTORNEY":
      return "Attorney";
    case "OTHER":
      return "Other";
    default:
      return role;
  }
}

export const metadata = {
  title: "Contact Details | LegatePro",
};

export default async function ContactDetailPage({ params }: PageProps) {
  const { estateId, contactId } = await params;

  await connectToDatabase();

  const doc = await Contact.findOne({
    _id: contactId,
    estateId,
  }).lean<ContactDoc | null>();

  if (!doc) {
    notFound();
  }

  const contact: ContactDoc = {
    ...doc,
    _id: doc._id.toString(),
    estateId: doc.estateId.toString(),
    ownerId: doc.ownerId.toString(),
  };

  async function deleteContact() {
    "use server";

    await connectToDatabase();
    await Contact.findOneAndDelete({
      _id: contactId,
      estateId,
    });

    redirect(`/app/estates/${estateId}/contacts`);
  }

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
            <span className="text-gray-900">{contact.name || "Contact"}</span>
          </nav>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
              {contact.name || "Unnamed contact"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {contact.relationship ? contact.relationship : "Relationship not set"}
              {contact.role ? (
                <>
                  {" · "}
                  <span className="font-medium text-gray-900">{roleLabel(contact.role)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 md:justify-end">
          <Link
            href={`/app/estates/${estateId}/contacts/${contactId}/edit`}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Edit
          </Link>

          <form action={deleteContact}>
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</p>
          <p className="mt-2 inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
            {roleLabel(contact.role)}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Created</p>
          <p className="mt-2 text-sm text-gray-700">{formatDate(contact.createdAt)}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last updated</p>
          <p className="mt-2 text-sm text-gray-700">{formatDate(contact.updatedAt)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Contact details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</p>
                <p className="mt-1 text-sm text-gray-900">{contact.name || "—"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Relationship</p>
                <p className="mt-1 text-sm text-gray-900">{contact.relationship || "—"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</p>
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="mt-1 block text-sm font-medium text-blue-700 hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-gray-900">—</p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</p>
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="mt-1 block text-sm font-medium text-blue-700 hover:underline"
                  >
                    {contact.phone}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-gray-900">—</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
              {contact.notes && contact.notes.trim().length > 0 ? contact.notes : "No notes yet."}
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Address</h2>
            <div className="mt-3 space-y-1 text-sm text-gray-700">
              {contact.addressLine1 || contact.addressLine2 ? (
                <>
                  {contact.addressLine1 && <p>{contact.addressLine1}</p>}
                  {contact.addressLine2 && <p>{contact.addressLine2}</p>}
                </>
              ) : (
                <p className="text-gray-500">No address on file.</p>
              )}

              {(contact.city || contact.state || contact.postalCode) && (
                <p>
                  {contact.city && <span>{contact.city}</span>}
                  {contact.city && (contact.state || contact.postalCode) && ", "}
                  {contact.state && <span>{contact.state}</span>}
                  {contact.postalCode && (
                    <>
                      {" "}
                      <span>{contact.postalCode}</span>
                    </>
                  )}
                </p>
              )}

              {contact.country && <p>{contact.country}</p>}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estate navigation</p>
            <div className="mt-3 space-y-2">
              <Link href={`/app/estates/${estateId}`} className="block font-medium text-blue-700 hover:underline">
                Back to overview
              </Link>
              <Link href={`/app/estates/${estateId}/contacts`} className="block font-medium text-blue-700 hover:underline">
                View all contacts
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}