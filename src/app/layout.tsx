// src/app/app/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import "../globals.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/app/estates" className="text-lg font-semibold tracking-tight">
            Legate<span className="text-emerald-400">Pro</span>
          </Link>
          <nav className="flex gap-4 text-sm text-slate-300">
            <Link href="/app/estates" className="hover:text-white">
              Estates
            </Link>
            {/* billing, account, etc later */}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}