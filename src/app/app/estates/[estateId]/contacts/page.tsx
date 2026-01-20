import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { requireEstateAccess } from "@/lib/estateAccess";
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

async function loadEstateAndContacts(estateId: string) {
  await connectToDatabase();

  const estate = await Estate.findOne({ _id: estateId }).lean();

  if (!estate) {
    return null;
  }

  const contactDocs = await Contact.find({ estateId })
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

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.role !== "VIEWER";

  const data = await loadEstateAndContacts(estateId);

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
        {canEdit ? (
          <Link
            href={`/app/estates/${estateId}/contacts/new`}
            className="inline-flex items-center rounded-md border border-transparent bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Add contact
          </Link>
        ) : (
          <Link
            href={`/app/estates/${estateId}?requestAccess=1`}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Request edit access
          </Link>
        )}
      </div>

      {/* Anchor for readiness deep-links */}
      <section
        id="add-contact"
        className="rounded-lg border border-border bg-background px-4 py-3"
      >
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Add a contact</p>
            <p className="text-xs text-muted-foreground">
              Create heirs, attorneys, creditors, vendors, and other key people so you can link them to estate activity.
            </p>
          </div>

          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/contacts/new`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-transparent bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 md:mt-0"
            >
              Add contact
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted md:mt-0"
            >
              Request edit access
            </Link>
          )}
        </div>
      </section>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Viewer access</p>
              <p className="text-xs text-amber-200">
                You can view contacts for this estate, but you can’t add or edit them.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

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
                      {canEdit ? (
                        <Link
                          href={`/app/estates/${estateId}/contacts/${contact._id}/edit`}
                          className="text-muted-foreground hover:underline"
                        >
                          Edit
                        </Link>
                      ) : null}
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