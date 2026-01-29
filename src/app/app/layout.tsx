// src/app/app/layout.tsx
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SidebarNav from "@/components/app/SidebarNav";

interface AppLayoutProps {
  children: ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  badge?: string;
};

function SignOutForm({ className }: { className?: string }) {
  return (
    <form
      action="/api/auth/signout?callbackUrl=/login"
      method="post"
      className={className}
    >
      <button
        type="submit"
        className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Sign out
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user as { name?: string | null; email?: string | null };
  const userName = user.name || user.email || "User";

  const navOverview: NavItem[] = [{ href: "/app/dashboard", label: "Dashboard" }];
  const navEstates: NavItem[] = [
    { href: "/app/estates", label: "Estates" },
    { href: "/app/tasks", label: "Tasks" },
    { href: "/app/expenses", label: "Expenses" },
    { href: "/app/rent", label: "Income" },
    { href: "/app/documents", label: "Documents" },
    { href: "/app/contacts", label: "Contacts" },
  ];
  const navSystem: NavItem[] = [{ href: "/app/settings", label: "Settings" }];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            LegatePro
          </div>
          <div className="mt-2 text-sm text-muted-foreground">Estate workspace</div>
        </div>

        <SidebarNav overview={navOverview} estates={navEstates} system={navSystem} />

        <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          <div className="text-foreground">{userName}</div>
          <SignOutForm className="mt-2" />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">LegatePro</h1>
              <p className="text-xs text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">{userName}</span>
              </p>
            </div>
            <SignOutForm />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}