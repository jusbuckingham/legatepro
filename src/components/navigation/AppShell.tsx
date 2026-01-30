"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellUser = {
  label: string;
  email: string;
};

interface AppShellProps {
  children: ReactNode;
  /** Optional user display shown in the sidebar footer */
  user?: AppShellUser;
  /** Optional environment label shown in the top bar */
  environmentLabel?: string;
}

type NavItem = Readonly<{
  label: string;
  href: string;
}>;

const primaryNav = [
  { label: "Overview", href: "/app" },
  { label: "Estates", href: "/app/estates" },
  { label: "Tasks", href: "/app/tasks" },
  { label: "Expenses", href: "/app/expenses" },
] as const satisfies readonly NavItem[];

const secondaryNav = [
  { label: "Billing", href: "/app/billing" },
  { label: "Account", href: "/app/settings" },
] as const satisfies readonly NavItem[];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function isActiveHref(pathname: string, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_LINK_BASE =
  "flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

export default function AppShell({
  children,
  user,
  environmentLabel = "Demo environment",
}: AppShellProps) {
  const pathname = usePathname() ?? "";

  // Defaults until real auth/user context is wired
  const userLabel = user?.label ?? "Demo User";
  const userEmail = user?.email ?? "demo@legatepro.test";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <a
        href="#app-content"
        aria-label="Skip to main content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-slate-950 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-slate-100 focus:ring-2 focus:ring-rose-500"
      >
        Skip to content
      </a>

      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-950/80 md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800/80 px-5">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            aria-label="LegatePro dashboard"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 text-xs font-semibold tracking-widest">
              LP
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">LegatePro</span>
              <span className="text-[11px] text-slate-400">
                Probate, simplified.
              </span>
            </div>
          </Link>
        </div>

        <nav
          aria-label="Primary"
          className="flex-1 space-y-6 overflow-y-auto px-3 py-4 text-sm"
        >
          <div>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Workspace
            </p>
            <ul className="space-y-1">
              {primaryNav.map((item) => {
                const active = isActiveHref(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cx(
                        NAV_LINK_BASE,
                        active
                          ? "bg-rose-600 text-white"
                          : "text-slate-200 hover:bg-slate-800 hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Account
            </p>
            <ul className="space-y-1">
              {secondaryNav.map((item) => {
                const active = isActiveHref(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cx(
                        NAV_LINK_BASE,
                        active
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
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
          <p className="truncate">Signed in as {userLabel}</p>
          <p className="truncate text-slate-600">{userEmail}</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile + desktop) */}
        <header className="flex h-14 items-center border-b border-slate-800 bg-slate-950/80 px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/app"
              className="flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label="LegatePro dashboard"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/60 bg-rose-500/10 text-xs font-semibold tracking-widest">
                LP
              </div>
              <span className="text-sm font-semibold">LegatePro</span>
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span className="hidden sm:inline">{environmentLabel}</span>
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
          </div>
        </header>

        {/* Content */}
        <main
          id="app-content"
          className="flex min-w-0 flex-1 bg-slate-950 px-4 py-6 md:px-8 md:py-8"
        >
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}