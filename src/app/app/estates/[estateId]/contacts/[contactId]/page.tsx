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
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-rose-400/70">
            Contact
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">
            {contact.name || "Unnamed Contact"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {contact.relationship ? `${contact.relationship}` : "Relationship not set"}
            {contact.role ? (
              <>
                {" · "}
                <span className="font-medium text-rose-300">
                  {roleLabel(contact.role)}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/estates/${estateId}/contacts/${contactId}/edit`}
            className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
          >
            Edit contact
          </Link>

          <form action={deleteContact}>
            <button
              type="submit"
              className="rounded-lg border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-red-900/60"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Meta */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Role
          </p>
          <p className="mt-2 inline-flex rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-500/30">
            {roleLabel(contact.role)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Created
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {formatDate(contact.createdAt)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Last updated
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {formatDate(contact.updatedAt)}
          </p>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: primary details */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contact details */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Contact details
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Name
                </p>
                <p className="mt-1 text-sm text-slate-100">
                  {contact.name || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Relationship
                </p>
                <p className="mt-1 text-sm text-slate-100">
                  {contact.relationship || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Email
                </p>
                <p className="mt-1 text-sm text-slate-100">
                  {contact.email || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Phone
                </p>
                <p className="mt-1 text-sm text-slate-100">
                  {contact.phone || "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
              {contact.notes && contact.notes.trim().length > 0
                ? contact.notes
                : "No notes added yet."}
            </p>
          </section>
        </div>

        {/* Right: address */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Address</h2>
            <div className="mt-3 space-y-1 text-sm text-slate-200">
              {contact.addressLine1 || contact.addressLine2 ? (
                <>
                  {contact.addressLine1 && <p>{contact.addressLine1}</p>}
                  {contact.addressLine2 && <p>{contact.addressLine2}</p>}
                </>
              ) : (
                <p>Address not provided.</p>
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

          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-200">Estate navigation</p>
            <div className="mt-3 space-y-2">
              <Link
                href={`/app/estates/${estateId}`}
                className="block text-sm text-rose-300 underline-offset-2 hover:underline"
              >
                Back to estate overview
              </Link>
              <Link
                href={`/app/estates/${estateId}/contacts`}
                className="block text-sm text-rose-300 underline-offset-2 hover:underline"
              >
                View all contacts for this estate
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}