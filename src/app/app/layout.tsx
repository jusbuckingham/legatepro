// src/app/app/layout.tsx
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

interface AppLayoutProps {
  children: ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  badge?: string;
};

function SignOutForm({ className }: { className?: string }) {
  return (
    <form action="/api/auth/signout?callbackUrl=/login" method="post" className={className}>
      <button
        type="submit"
        className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800"
      >
        Sign out
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user as { name?: string | null; email?: string | null };
  const userName = user.name || user.email || "User";

  const navOverview: NavItem[] = [{ href: "/app", label: "Dashboard", badge: "Home" }];
  const navEstates: NavItem[] = [
    { href: "/app/estates", label: "Estates" },
    { href: "/app/tasks", label: "Tasks & deadlines" },
    { href: "/app/expenses", label: "Expenses & reimbursements" },
    { href: "/app/rent", label: "Rent & income" },
    { href: "/app/documents", label: "Documents" },
    { href: "/app/contacts", label: "Contacts" },
  ];
  const navSystem: NavItem[] = [{ href: "/app/settings", label: "Settings" }];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-950/80 px-4 py-6 md:flex">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            LegatePro
          </div>
          <div className="mt-2 text-sm text-slate-300">
            Probate &amp; estate workspace
          </div>
        </div>

        <nav className="flex-1 space-y-1 text-sm" aria-label="App navigation">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Overview
          </p>
          {navOverview.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mt-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-slate-200 hover:bg-slate-900"
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="text-[10px] uppercase text-emerald-400">{item.badge}</span>
              ) : null}
            </Link>
          ))}

          <p className="mt-4 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Estates
          </p>
          {navEstates.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
            >
              {item.label}
            </Link>
          ))}

          <p className="mt-4 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            System
          </p>
          {navSystem.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
          <div className="text-slate-300">{userName}</div>
          <SignOutForm className="mt-2" />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">LegatePro</h1>
              <p className="text-xs text-slate-400">
                Signed in as{" "}
                <span className="font-medium text-slate-200">{userName}</span>
              </p>
            </div>
            <SignOutForm />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}