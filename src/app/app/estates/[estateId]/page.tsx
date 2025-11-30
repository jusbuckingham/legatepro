"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

/**
 * Estate overview page-level navigation.
 *
 * This is the main page component for /app/estates/[estateId].
 * It renders a top tab bar (Overview, Tasks, Time, Invoices) and
 * relies on other nested routes/layouts to show the actual content.
 */
export default function EstatePage() {
  const pathname = usePathname();
  const params = useParams<{ estateId: string }>();
  const estateId = params.estateId;

  const tabs: { name: string; href: string }[] = [
    { name: "Overview", href: `/app/estates/${estateId}` },
    { name: "Tasks", href: `/app/estates/${estateId}/tasks` },
    { name: "Time", href: `/app/estates/${estateId}/time` },
    { name: "Invoices", href: `/app/estates/${estateId}/invoices` },
  ];

  const isActive = (href: string) => {
    // Ensure active state also works for nested routes like /tasks/new, /invoices/123, etc.
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/`)) return true;
    return false;
  };

  return (
    <div>
      <nav className="mb-6 flex gap-6 border-b border-slate-800">
        {tabs.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                active
                  ? "border-b-2 border-sky-500 pb-2 text-slate-100"
                  : "pb-2 text-slate-400 hover:text-slate-200"
              }
            >
              {t.name}
            </Link>
          );
        })}
      </nav>
      {/* You can later add estate overview content here, e.g. summary cards, recent activity, etc. */}
    </div>
  );
}