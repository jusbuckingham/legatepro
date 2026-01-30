import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewContactForm } from "@/components/contacts/NewContactForm";

export const metadata: Metadata = {
  title: "New Contact · LegatePro",
};

export default async function NewContactPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold text-slate-100">
          New contact
        </h1>
        <p className="text-sm text-slate-400">
          Add a person or organization you can associate with estates, tasks, and documents.
        </p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        <NewContactForm />
      </div>
    </div>
  );
}