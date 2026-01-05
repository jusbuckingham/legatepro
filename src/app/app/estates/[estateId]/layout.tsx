"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { ReactNode } from "react";

interface EstateLayoutProps {
  children: ReactNode;
}

function getNavItems(estateId: string) {
  return [
    { label: "Overview", href: `/app/estates/${estateId}` },
    { label: "Tasks", href: `/app/estates/${estateId}/tasks` },
    { label: "Properties", href: `/app/estates/${estateId}/properties` },
    { label: "Documents", href: `/app/estates/${estateId}/documents` },
    { label: "Contacts", href: `/app/estates/${estateId}/contacts` },
    { label: "Notes", href: `/app/estates/${estateId}/notes` },
    { label: "Expenses", href: `/app/estates/${estateId}/expenses` },
    { label: "Rent", href: `/app/estates/${estateId}/rent` },
    { label: "Timecard", href: `/app/estates/${estateId}/time` },
    { label: "Invoices", href: `/app/estates/${estateId}/invoices` },
    { label: "Activity", href: `/app/estates/${estateId}/activity` },
  ];
}

export default function EstateLayout({ children }: EstateLayoutProps) {
  const { estateId } = useParams<{ estateId: string }>();
  const pathname = usePathname();
  const navItems = getNavItems(estateId);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <aside className="md:w-60 shrink-0">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h1 className="text-sm font-semibold text-slate-100">
            Estate workspace
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Switch between tasks, properties, documents, contacts, notes,
            expenses, rent, and your timecard.
          </p>

          <nav className="mt-3 space-y-1 text-sm">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              const baseClasses =
                "flex items-center justify-between rounded-md px-2 py-1.5 transition-colors";
              const activeClasses = isActive
                ? " border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : " text-slate-300 hover:bg-slate-800/70";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${baseClasses} ${activeClasses}`}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}