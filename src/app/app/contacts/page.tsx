// src/app/app/contacts/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";
import { Contact } from "@/models/Contact";

export const metadata = {
  title: "Contacts | LegatePro",
};

type EstateListItem = {
  _id: unknown;
  name?: string;
  caseNumber?: string;
};

type RawContact = {
  _id: unknown;
  estateId: unknown;
  name?: string;
  relationship?: string;
};

type GroupedContact = {
  id: string;
  name: string;
  relationship?: string;
};

export default async function ContactsHubPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  // Load estates for this user
  const rawEstates = (await Estate.find({
    ownerId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean()) as EstateListItem[];

  const estates = rawEstates.map((estate) => ({
    id: String(estate._id),
    name: estate.name ?? "Untitled estate",
    caseNumber: estate.caseNumber ?? "",
  }));

  // Load all contacts for this user once, then group by estateId
  const rawContacts = (await Contact.find({
    ownerId: session.user.id,
  })
    .sort({ name: 1 })
    .lean()) as unknown as RawContact[];

  const contactsByEstate = new Map<string, GroupedContact[]>();

  for (const contact of rawContacts) {
    const estateKey = String(contact.estateId);
    const list = contactsByEstate.get(estateKey) ?? [];

    list.push({
      id: String(contact._id),
      name: contact.name ?? "Unnamed contact",
      relationship: contact.relationship,
    });

    contactsByEstate.set(estateKey, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Contacts are organized per estate. Choose an estate to view or manage
          its contacts.
        </p>
      </div>

      {estates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have any estates yet.{" "}
          <Link href="/app/estates/new" className="underline">
            Create your first estate
          </Link>{" "}
          to start adding contacts.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {estates.map((estate) => {
            const estateContacts = contactsByEstate.get(estate.id) ?? [];

            return (
              <div
                key={estate.id}
                className="flex flex-col rounded-lg border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{estate.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {estate.caseNumber
                        ? `Case #${estate.caseNumber}`
                        : "No case number"}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {estateContacts.length} contact
                    {estateContacts.length === 1 ? "" : "s"}
                  </span>
                </div>

                {estateContacts.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {estateContacts.slice(0, 3).map((contact) => (
                      <li
                        key={contact.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {contact.name}
                          </div>
                          {contact.relationship && (
                            <div className="text-xs text-muted-foreground">
                              {contact.relationship}
                            </div>
                          )}
                        </div>
                        <Link
                          href={`/app/estates/${estate.id}/contacts/${contact.id}`}
                          className="text-xs font-medium text-primary underline"
                        >
                          View
                        </Link>
                      </li>
                    ))}
                    {estateContacts.length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        +{estateContacts.length - 3} more…
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No contacts yet for this estate.
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/app/estates/${estate.id}/contacts`}
                    className="text-xs font-medium text-primary underline"
                  >
                    Open contacts
                  </Link>
                  <Link
                    href={`/app/estates/${estate.id}/contacts/new`}
                    className="text-xs font-medium text-primary underline"
                  >
                    Add contact
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}