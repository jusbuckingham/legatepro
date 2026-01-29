import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase, serializeMongoDoc } from "@/lib/db";
import { Contact } from "@/models/Contact";
import { ContactEditForm } from "@/components/contacts/ContactEditForm";

type PageProps = {
  params: {
    contactId: string;
  };
};

export default async function EditContactPage({ params }: PageProps) {
  const { contactId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const contactRaw = await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .select("_id name email phone role notes ownerId")
    .lean();

  if (!contactRaw) {
    notFound();
  }

  const contact = serializeMongoDoc(contactRaw) as Record<string, unknown>;
  const asString = (v: unknown) => (typeof v === "string" ? v : "");

  const initial = {
    name: asString(contact.name) || "",
    email: asString(contact.email) || "",
    phone: asString(contact.phone) || "",
    role: asString(contact.role) || "OTHER",
    notes: asString(contact.notes) || "",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Edit contact
        </div>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">
          Update contact details
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Keep contact information accurate for estate communication and record keeping.
        </p>
      </div>
      <ContactEditForm contactId={contactId} initial={initial} />
    </div>
  );
}