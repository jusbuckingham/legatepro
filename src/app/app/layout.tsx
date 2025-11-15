"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };

const navItems: NavItem[] = [
  { label: "Estates", href: "/app/estates" },
  { label: "Billing", href: "/app/billing" },
  { label: "Settings", href: "/app/settings" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/app/estates" className="flex items-center gap-2">
            <Image
              src="/logo-icon.svg"
              alt="LegatePro logo"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-base font-semibold tracking-tight">
              Legate<span className="text-red-400">Pro</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              const baseClasses =
                "rounded-full px-3 py-1 transition-colors hover:text-slate-50";
              const activeClasses = isActive
                ? " bg-slate-800 text-slate-50 border border-slate-700"
                : " text-slate-300 hover:bg-slate-800/70";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${baseClasses} ${activeClasses}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
