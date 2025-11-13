// src/app/app/estates/[estateId]/contacts/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";

interface Contact {
  _id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

// Fetch contacts for this estate
async function fetchContacts(estateId: string): Promise<Contact[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/contacts?estateId=${estateId}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as { contacts?: Contact[] };
  return data.contacts || [];
}

interface PageProps {
  params: { estateId: string };
}

export default async function EstateContactsPage({ params }: PageProps) {
  const { estateId } = params;

  if (!estateId) {
    notFound();
  }

  const contacts = await fetchContacts(estateId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>

        <Link
          href={`/app/estates/${estateId}/contacts/new`}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
        >
          Add Contact
        </Link>
      </div>

      {contacts.length === 0 ? (
        <p className="text-gray-500 text-sm">No contacts found for this estate.</p>
      ) : (
        <div className="space-y-4">
          {contacts.map((c: Contact) => (
            <div
              key={c._id}
              className="border rounded-lg p-4 flex flex-col gap-1 bg-white shadow-sm"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium">{c.name}</h2>
                <span className="text-xs text-gray-500">{c.role}</span>
              </div>

              {c.email && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Email:</span> {c.email}
                </p>
              )}

              {c.phone && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Phone:</span> {c.phone}
                </p>
              )}

              {c.notes && (
                <p className="text-sm text-gray-600 mt-2">{c.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
