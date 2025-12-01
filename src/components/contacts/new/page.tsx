import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewContactForm } from "@/components/contacts/NewContactForm";

export default async function NewContactPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <NewContactForm />
    </div>
  );
}