// src/app/app/estates/[estateId]/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";

export default function EstateLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { estateId: string };
}) {
  const { estateId } = params;

  const tabs = [
    { href: `/app/estates/${estateId}`, label: "Overview" },
    { href: `/app/estates/${estateId}/tasks`, label: "Tasks" },
    // we'll add Expenses, Time, Properties, etc later
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Link href="/app/estates" className="text-sm text-slate-400 hover:text-emerald-400">
          ← Back to estates
        </Link>
      </div>
      <nav className="flex gap-2 border-b border-slate-800 pb-1 text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-full px-3 py-1 text-slate-300 hover:bg-slate-800 hover:text-white data-[active=true]:bg-emerald-500 data-[active=true]:text-slate-950"
            data-active={false} // we could make this smart later with useSelectedLayoutSegment
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}