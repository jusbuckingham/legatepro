// src/app/app/layout.tsx
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

interface AppLayoutProps {
  children: ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user as { name?: string | null; email?: string | null };
  const userName = user.name || user.email || "User";

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

        <nav className="flex-1 space-y-1 text-sm">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Overview
          </p>
          <Link
            href="/app"
            className="mt-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-slate-200 hover:bg-slate-900"
          >
            <span>Dashboard</span>
            <span className="text-[10px] uppercase text-emerald-400">Home</span>
          </Link>

          <p className="mt-4 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Estates
          </p>
          <Link
            href="/app/estates"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Estates
          </Link>
          <Link
            href="/app/tasks"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Tasks &amp; deadlines
          </Link>
          <Link
            href="/app/expenses"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Expenses &amp; reimbursements
          </Link>
          <Link
            href="/app/rent"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Rent &amp; income
          </Link>
          <Link
            href="/app/documents"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Documents
          </Link>
          <Link
            href="/app/contacts"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Contacts
          </Link>

          <p className="mt-4 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            System
          </p>
          <Link
            href="/app/settings"
            className="flex items-center rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            Settings
          </Link>
        </nav>

        <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
          <div className="text-slate-300">{userName}</div>
          <form action="/api/auth/signout?callbackUrl=/login" method="post" className="mt-1">
            <button
              type="submit"
              className="inline-flex items-center text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              Sign out
            </button>
          </form>
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
            <form action="/api/auth/signout?callbackUrl=/login" method="post">
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-500 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}