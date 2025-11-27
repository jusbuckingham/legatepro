"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function EstateNav({ estateId }: { estateId: string }) {
  const pathname = usePathname();

  const tabs = [
    { name: "Overview", href: `/app/estates/${estateId}` },
    { name: "Tasks", href: `/app/estates/${estateId}/tasks` },
    { name: "Time", href: `/app/estates/${estateId}/time` },
    { name: "Invoices", href: `/app/estates/${estateId}/invoices` },
  ];

  return (
    <nav className="flex gap-6 border-b border-slate-800 mb-6">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "text-slate-100 border-b-2 border-sky-500 pb-2"
                : "text-slate-400 hover:text-slate-200 pb-2"
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