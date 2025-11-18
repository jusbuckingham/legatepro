// src/app/app/contacts/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";
import { Estate } from "@/models/Estate";

export const metadata = {
  title: "Contacts | LegatePro",
  description: "View all contacts across your estates.",
};

type RawContact = {
  _id: string;
  ownerId: string;
  estateId: string | null;
  name: string;
  relationship?: string;
  role?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type RawEstate = {
  _id: string;
  caseTitle?: string;
  courtCaseNumber?: string;
};

type ContactListItem = {
  id: string;
  estateId: string | null;
  estateLabel: string;
  name: string;
  relationship?: string;
  roleLabel?: string;
  email?: string;
  phone?: string;
  createdAtLabel?: string;
};

function formatDate(value?: Date | string): string | undefined {
  if (!value) return undefined;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatRole(role?: string): string | undefined {
  if (!role) return undefined;
  switch (role) {
    case "PERSONAL_REPRESENTATIVE":
      return "Personal Representative";
    case "ATTORNEY":
      return "Attorney";
    case "HEIR":
      return "Heir";
    case "BENEFICIARY":
      return "Beneficiary";
    case "CREDITOR":
      return "Creditor";
    case "OTHER":
      return "Other";
    default:
      return role.toString();
  }
}

async function loadContacts(ownerId: string): Promise<{
  items: ContactListItem[];
}> {
  await connectToDatabase();

  // Load all estates for label lookup
  const estates = (await Estate.find({ ownerId })
    .select("_id caseTitle courtCaseNumber")
    .lean()) as unknown as RawEstate[];

  const estateMap = new Map<string, string>();
  for (const estate of estates) {
    const key = String(estate._id);
    const label =
      estate.caseTitle ||
      estate.courtCaseNumber ||
      `Estate ${key.slice(-6).toUpperCase()}`;
    estateMap.set(key, label);
  }

  // Load all contacts for this owner
  const contacts = (await Contact.find({ ownerId })
    .sort({ createdAt: -1 })
    .lean()) as unknown as RawContact[];

  const items: ContactListItem[] = contacts.map((contact) => {
    const id = String(contact._id);
    const estateId = contact.estateId ? String(contact.estateId) : null;
    const estateLabel =
      (estateId && estateMap.get(estateId)) || "Unassigned Estate";

    return {
      id,
      estateId,
      estateLabel,
      name: contact.name,
      relationship: contact.relationship,
      roleLabel: formatRole(contact.role),
      email: contact.email,
      phone: contact.phone,
      createdAtLabel: formatDate(contact.createdAt),
    };
  });

  return { items };
}

export default async function ContactsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app/contacts");
  }

  const ownerId = session.user.id;
  const { items } = await loadContacts(ownerId);

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All people related to your estates—attorneys, heirs, creditors, and
            more.
          </p>
        </div>
        {/* In future: global “New Contact” that first asks which estate */}
        <Link
          href="/app/estates"
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          Go to Estates
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            No contacts yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an estate first, then add contacts from within that estate.
          </p>
          <div className="mt-4">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              Create your first estate
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Relationship
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {items.map((contact) => (
                <tr key={contact.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                    {contact.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {contact.roleLabel || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {contact.relationship || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {contact.estateLabel}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {contact.email && (
                      <span className="block truncate">{contact.email}</span>
                    )}
                    {contact.phone && (
                      <span className="block truncate">{contact.phone}</span>
                    )}
                    {!contact.email && !contact.phone && "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    {contact.estateId ? (
                      <Link
                        href={`/app/estates/${contact.estateId}/contacts/${contact.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No estate
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}