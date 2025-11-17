// src/app/app/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppHomePage() {
  const session = await auth();

  // If there is no active session, send the user to the login page
  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user as { name?: string | null; email?: string | null };
  const userName = user.name || user.email || "User";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-2">LegatePro App</h1>
        <p className="text-xs text-slate-400 mb-4">
          Signed in as{" "}
          <span className="font-medium text-slate-100">{userName}</span>
        </p>
        <p className="text-sm text-slate-400">
          This is the authenticated app shell placeholder. Once auth is fully dialed in,
          this page will render the estate dashboard and related navigation.
        </p>
        <a
          href="/api/auth/signout?callbackUrl=/login"
          className="mt-6 inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-500 transition-colors"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}