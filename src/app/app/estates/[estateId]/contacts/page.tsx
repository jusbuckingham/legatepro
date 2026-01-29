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
    redirect(`/login?callbackUrl=${encodeURIComponent(`/app/estates/${estateId}/contacts`)}`);
  }

  const access = await requireEstateAccess({ estateId, userId: session.user.id });
  const canEdit = access.canEdit;

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
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-muted-foreground">
            <Link href="/app/estates" className="hover:underline">
              Estates
            </Link>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <Link href={`/app/estates/${estateId}`} className="hover:underline">
              Overview
            </Link>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span className="text-foreground">Contacts</span>
          </nav>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Key people for this estate: heirs, attorneys, creditors, vendors, and collaborators.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Estate: <span className="font-medium text-foreground">{estateDisplayName}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/contacts/new`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Add contact
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Request edit access
            </Link>
          )}

          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{contacts.length}</span> contact
            {contacts.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <section
        id="add-contact"
        className="rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Add a contact</p>
            <p className="text-xs text-muted-foreground">
              Create heirs, attorneys, creditors, vendors, and other key people so you can link them to tasks, invoices, and documents.
            </p>
          </div>

          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/contacts/new`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Add contact
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Request edit access
            </Link>
          )}
        </div>
      </section>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-amber-900">Viewer access</p>
              <p className="text-xs text-amber-800">
                You can view contacts for this estate, but you can’t add or edit them.
              </p>
            </div>
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 md:mt-0"
            >
              Request edit access
            </Link>
          </div>
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium text-foreground">No contacts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add heirs, attorneys, creditors, vendors, and other key people to keep your estate organized.
          </p>
          {canEdit ? (
            <Link
              href={`/app/estates/${estateId}/contacts/new`}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Add your first contact
            </Link>
          ) : (
            <Link
              href={`/app/estates/${estateId}?requestAccess=1`}
              className="mt-4 inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Request edit access
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
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
            <tbody className="divide-y divide-border">
              {contacts.map((contact) => {
                const name = contact.name?.trim() ? contact.name.trim() : "Untitled contact";
                const email = contact.email?.trim() ? contact.email.trim() : null;
                const phone = contact.phone?.trim() ? contact.phone.trim() : null;

                return (
                  <tr key={contact._id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 align-middle">
                      <Link
                        href={`/app/estates/${estateId}/contacts/${contact._id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {contact.role?.trim() ? contact.role : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {contact.relationship?.trim() ? (
                        contact.relationship
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {email ? (
                        <a className="text-blue-700 hover:underline" href={`mailto:${email}`}>
                          {email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {phone ? (
                        <a className="text-blue-700 hover:underline" href={`tel:${phone.replace(/\s+/g, "")}`}>
                          {phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link
                          href={`/app/estates/${estateId}/contacts/${contact._id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          View
                        </Link>
                        {canEdit ? (
                          <Link
                            href={`/app/estates/${estateId}/contacts/${contact._id}/edit`}
                            className="text-muted-foreground hover:text-foreground hover:underline"
                          >
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}