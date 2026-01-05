import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Contact } from "@/models/Contact";
import { ContactEditForm } from "@/components/contacts/ContactEditForm";

type PageProps = {
  params: {
    contactId: string;
  };
};

type ContactDoc = {
  _id: string | { toString: () => string };
  ownerId: string | { toString: () => string };
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  notes?: string;
};

export default async function EditContactPage({ params }: PageProps) {
  const { contactId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const contact = (await Contact.findOne({
    _id: contactId,
    ownerId: session.user.id,
  })
    .select("_id name email phone role notes ownerId")
    .lean()) as ContactDoc | null;

  if (!contact) {
    notFound();
  }

  const initial = {
    name: contact.name ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "OTHER",
    notes: contact.notes ?? "",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <ContactEditForm contactId={contactId} initial={initial} />
    </div>
  );
}