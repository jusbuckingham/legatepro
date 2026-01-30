"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function normalizePath(value: string): string {
  // Ignore query/hash and trim trailing slash (except root)
  const base = value.split("?")[0].split("#")[0];
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

type NavItem = {
  href: string;
  label: string;
  badge?: string;
};

function isActivePath(pathname: string, href: string): boolean {
  const p = normalizePath(pathname);
  const h = normalizePath(href);

  if (p === h) return true;
  if (h !== "/" && p.startsWith(h + "/")) return true;
  return false;
}

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>

      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-muted/40 text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <span>{item.label}</span>

            {item.badge ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export default function SidebarNav({
  overview,
  estates,
  system,
}: {
  overview: NavItem[];
  estates: NavItem[];
  system: NavItem[];
}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-4" aria-label="App navigation">
      <NavSection title="Overview" items={overview} pathname={pathname} />
      <NavSection title="Estates" items={estates} pathname={pathname} />
      <NavSection title="System" items={system} pathname={pathname} />
    </nav>
  );
}