"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function EstateNav({ estateId }: { estateId: string }) {
  const pathname = usePathname();

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
  );
}

export default EstateNav;