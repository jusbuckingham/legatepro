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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <ContactEditForm contactId={contactId} initial={initial} />
    </div>
  );
}