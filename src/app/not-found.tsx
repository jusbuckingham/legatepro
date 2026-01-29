import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-1px)] items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          The page you’re looking for doesn’t exist, or you don’t have access to it.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Go to Estates
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}