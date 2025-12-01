import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";

type PageProps = {
  params: Promise<{
    contactId: string;
  }>;
};

type EstateRef = {
  _id: string | { toString: () => string };
  displayName?: string;
  caseName?: string;
};

type ContactDoc = {
  _id: string | { toString: () => string };
  ownerId: string | { toString: () => string };
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
  estates?: EstateRef[];
};

function formatRole(role?: string): string {
  if (!role) return "—";
  const upper = role.toUpperCase();
  switch (upper) {
    case "EXECUTOR":
      return "Executor";
    case "ADMINISTRATOR":
      return "Administrator";
    case "HEIR":
      return "Heir / Beneficiary";
    case "ATTORNEY":
      return "Attorney";
    case "CREDITOR":
      return "Creditor";
    case "VENDOR":
      return "Vendor";
    case "OTHER":
      return "Other";
    default:
      return role;
  }
}

export default async function ContactDetailPage({ params }: PageProps) {
  const { contactId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const contact = (await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .populate("estates", "displayName caseName")
    .lean()) as ContactDoc | null;

  if (!contact) {
    notFound();
  }


  const name = contact.name?.trim() || "Unnamed contact";

  const estates = (contact.estates ?? []).map((est, index) => {
    const estId =
      typeof est._id === "string" ? est._id : est._id.toString();
    const label =
      est.displayName ||
      est.caseName ||
      `Estate …${estId.slice(-6) || index + 1}`;
    return {
      _id: estId,
      label,
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Contact
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            {name}
          </h1>
          <p className="text-xs text-slate-400">
            {formatRole(contact.role)}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/app/contacts"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Back to contacts
          </Link>
          {/* Future: edit contact page */}
          {/* <Link
            href={`/app/contacts/${id}/edit`}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
          >
            Edit contact
          </Link> */}
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Email
          </h2>
          <p className="mt-1 text-sm text-slate-100">
            {contact.email || "—"}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Phone
          </h2>
          <p className="mt-1 text-sm text-slate-100">
            {contact.phone || "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
            {contact.notes?.trim() || "No notes added yet."}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Linked estates
          </h2>
          {/* Future: “Link to estate” action */}
        </div>

        {estates.length === 0 ? (
          <p className="text-xs text-slate-500">
            This contact is not linked to any estates yet.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {estates.map((est) => (
              <li key={est._id} className="flex items-center justify-between">
                <Link
                  href={`/app/estates/${est._id}`}
                  className="text-sky-400 hover:text-sky-300"
                >
                  {est.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}