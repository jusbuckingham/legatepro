import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Contact } from "@/models/Contact";

type PageProps = {
  params: {
    contactId: string;
  };
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
      return "Beneficiary";
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
  const { contactId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const contactRaw = await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  }).lean();

  if (!contactRaw) {
    notFound();
  }

  const contact = serializeMongoDoc(contactRaw) as Record<string, unknown>;
  const contactIdValue = (contact.id as string | undefined) ?? contactId;
  const contactIdEncoded = encodeURIComponent(contactIdValue);

  const name = (typeof contact.name === "string" ? contact.name : "").trim() || "Unnamed contact";
  const email = typeof contact.email === "string" ? contact.email : undefined;
  const phone = typeof contact.phone === "string" ? contact.phone : undefined;
  const role = typeof contact.role === "string" ? contact.role : undefined;
  const notes = typeof contact.notes === "string" ? contact.notes : undefined;

  const estatesRaw = Array.isArray(contact.estates) ? (contact.estates as unknown[]) : [];
  const estates = estatesRaw.map((est, index) => {
    // If not populated, `est` may be a string id.
    if (typeof est === "string") {
      const estId = est;
      return {
        _id: estId,
        label: `Estate …${estId.slice(-6) || index + 1}`,
      };
    }

    if (est && typeof est === "object") {
      const e = serializeMongoDoc(est) as Record<string, unknown>;
      const estId = (e.id as string | undefined) ?? "";
      const displayName = typeof e.displayName === "string" ? e.displayName : "";
      const caseName = typeof e.caseName === "string" ? e.caseName : "";

      const label = displayName.trim() || caseName.trim() || `Estate …${(estId || String(index + 1)).slice(-6)}`;
      return { _id: estId || String(index + 1), label };
    }

    // Fallback
    return { _id: String(index + 1), label: `Estate …${index + 1}` };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Contact details
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            {name}
          </h1>
          <p className="text-xs text-slate-400">
            Role: {formatRole(role)}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/app/contacts"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Back
          </Link>
          <Link
            href={`/app/contacts/${contactIdEncoded}/edit`}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
          >
            Edit
          </Link>
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Email address
          </h2>
          <p className="mt-1 text-sm text-slate-100">
            {email ? (
              <a
                href={`mailto:${email}`}
                className="text-sky-300 hover:text-sky-200"
              >
                {email}
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Phone number
          </h2>
          <p className="mt-1 text-sm text-slate-100">
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="text-sky-300 hover:text-sky-200"
              >
                {phone}
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="sm:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
            {notes?.trim() || "No notes yet."}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Linked estates</h2>
            <p className="text-xs text-slate-500">Estates this contact is associated with.</p>
          </div>
          {/* Future: “Link to estate” action */}
        </div>

        {estates.length === 0 ? (
          <p className="text-xs text-slate-500">
            No linked estates yet.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {estates.map((est) => (
              <li key={est._id} className="flex items-center justify-between">
                <Link
                  href={`/app/estates/${encodeURIComponent(est._id)}`}
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