

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
}

const primaryNav: NavItem[] = [
  { label: "Overview", href: "/app" },
  { label: "Estates", href: "/app/estates" },
  { label: "Tasks", href: "/app/tasks" },
  { label: "Expenses", href: "/app/expenses" },
];

const secondaryNav: NavItem[] = [
  { label: "Billing", href: "/app/billing" },
  { label: "Account", href: "/app/settings" },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-slate-800 bg-slate-950/80">
        <div className="flex h-16 items-center gap-2 px-5 border-b border-slate-800/80">
          <div className="h-8 w-8 rounded-md border border-red-500/60 bg-red-500/10 flex items-center justify-center text-xs font-semibold tracking-widest">
            LP
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">LegatePro</span>
            <span className="text-[11px] text-slate-400">
              Probate, simplified.
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 text-sm">
          <div>
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Workspace
            </p>
            <ul className="space-y-1">
              {primaryNav.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={classNames(
                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                        active
                          ? "bg-red-600 text-white"
                          : "text-slate-200 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Account
            </p>
            <ul className="space-y-1">
              {secondaryNav.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={classNames(
                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                        active
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="border-t border-slate-800/80 px-4 py-3 text-xs text-slate-500">
          <p className="truncate">Signed in as Demo User</p>
          <p className="truncate text-slate-600">demo@legatepro.test</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile + desktop) */}
        <header className="flex h-14 items-center border-b border-slate-800 bg-slate-950/80 px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="h-8 w-8 rounded-md border border-red-500/60 bg-red-500/10 flex items-center justify-center text-xs font-semibold tracking-widest">
              LP
            </div>
            <span className="text-sm font-semibold">LegatePro</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span className="hidden sm:inline">Demo environment</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8 bg-slate-950">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}