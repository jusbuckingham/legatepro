import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Contact, ContactDocument } from "@/models/Contact";

interface PageParams {
  estateId: string;
}

interface EstateContactsPageProps {
  params: Promise<PageParams>;
}

interface ContactListItem {
  _id: string;
  name: string;
  role?: string;
  relationship?: string;
  email?: string;
  phone?: string;
}

async function loadEstateAndContacts(estateId: string, ownerId: string) {
  await connectToDatabase();

  const estate = await Estate.findOne(
    ownerId ? { _id: estateId, ownerId } : { _id: estateId }
  ).lean();

  if (!estate) {
    return null;
  }

  const contactDocs = await Contact.find({ estateId, ownerId })
    .sort({ createdAt: -1 })
    .lean<ContactDocument[]>();

  const contacts: ContactListItem[] = contactDocs.map((doc) => ({
    _id: String(doc._id),
    name: doc.name,
    role: doc.role,
    relationship: doc.relationship,
    email: doc.email,
    phone: doc.phone,
  }));

  return { estate, contacts };
}

export const metadata = {
  title: "Estate Contacts | LegatePro",
};

interface EstateSummary {
  displayName?: string;
  caseName?: string;
}

export default async function EstateContactsPage({
  params,
}: EstateContactsPageProps) {
  const { estateId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app");
  }

  const data = await loadEstateAndContacts(estateId, session.user.id);

  if (!data) {
    notFound();
  }

  const { estate, contacts } = data;
  const estateSummary = estate as EstateSummary;
  const estateDisplayName =
    estateSummary.displayName ??
    estateSummary.caseName ??
    "Untitled estate";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            People connected to this estate – heirs, attorneys, creditors, and
            more.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Estate:{" "}
            <span className="font-medium">{estateDisplayName}</span>
          </p>
        </div>
        <Link
          href={`/app/estates/${estateId}/contacts/new`}
          className="inline-flex items-center rounded-md border border-transparent bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Add contact
        </Link>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No contacts yet for this estate. Create your first contact to track
          heirs, attorneys, creditors, and other key people.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Relationship</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact._id} className="border-t">
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/app/estates/${estateId}/contacts/${contact._id}`}
                      className="font-medium hover:underline"
                    >
                      {contact.name || "Untitled contact"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {contact.role ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {contact.relationship ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {contact.email ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {contact.phone ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <div className="flex justify-end gap-3 text-xs">
                      <Link
                        href={`/app/estates/${estateId}/contacts/${contact._id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        View
                      </Link>
                      <Link
                        href={`/app/estates/${estateId}/contacts/${contact._id}/edit`}
                        className="text-muted-foreground hover:underline"
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
    </div>
  );
}