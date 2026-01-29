"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useParams } from "next/navigation";
import type { ReactNode } from "react";

interface EstateLayoutProps {
  children: ReactNode;
}

function getNavItems(estateId: string) {
  return [
    { label: "Overview", href: `/app/estates/${estateId}` },
    { label: "Activity", href: `/app/estates/${estateId}/activity` },
    { label: "Timeline", href: `/app/estates/${estateId}/timeline` },
    { label: "__DIVIDER__", href: "#" },
    { label: "Tasks", href: `/app/estates/${estateId}/tasks` },
    { label: "Properties", href: `/app/estates/${estateId}/properties` },
    { label: "Documents", href: `/app/estates/${estateId}/documents` },
    { label: "Contacts", href: `/app/estates/${estateId}/contacts` },
    { label: "Notes", href: `/app/estates/${estateId}/notes` },
    { label: "Rent", href: `/app/estates/${estateId}/rent` },
    { label: "Timecard", href: `/app/estates/${estateId}/time` },
    { label: "Invoices & expenses", href: `/app/estates/${estateId}/invoices` },
  ];
}

export default function EstateLayout({ children }: EstateLayoutProps) {
  const { estateId } = useParams<{ estateId: string }>();
  const pathname = usePathname();
  const safeEstateId = encodeURIComponent(estateId ?? "");
  const navItems = useMemo(() => getNavItems(safeEstateId), [safeEstateId]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <aside className="shrink-0 md:w-60">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <h1 className="text-sm font-semibold text-slate-100">Estate hub</h1>
          <p className="mt-1 text-xs text-slate-400">
            Your estate, organized in one place.
          </p>

          <nav className="mt-3 space-y-1 text-sm" aria-label="Estate sections">
            {navItems.map((item, idx) => {
              if (item.label === "__DIVIDER__") {
                return (
                  <div
                    key={`divider-${idx}`}
                    className="my-2 border-t border-slate-700/60"
                  />
                );
              }

              const isOverview = item.href === `/app/estates/${safeEstateId}`;

              const isActive = isOverview
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");

              const baseClasses =
                "group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors";
              const activeClasses = isActive
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "text-slate-300 hover:bg-slate-800/70";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${baseClasses} ${activeClasses}`}
                >
                  <span className="truncate">{item.label}</span>
                  <span
                    aria-hidden
                    className={
                      isActive
                        ? "text-emerald-200"
                        : "text-slate-500 group-hover:text-slate-300"
                    }
                  >
                    →
                  </span>
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