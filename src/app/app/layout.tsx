import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
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

          <nav className="flex items-center gap-4 text-sm text-slate-300">
            <Link href="/app/estates" className="hover:text-slate-50">
              Estates
            </Link>
            <Link href="/app/billing" className="hover:text-slate-50">
              Billing
            </Link>
            <Link href="/app/settings" className="hover:text-slate-50">
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
