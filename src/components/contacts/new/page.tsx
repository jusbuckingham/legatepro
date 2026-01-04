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
      <h1 className="mb-6 text-xl font-semibold text-slate-100">
        New contact
      </h1>
      <NewContactForm />
    </div>
  );
}