"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Keep this minimal; in prod you can send to Sentry/Logtail/etc.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-1px)] items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          This page hit an unexpected error. You can try again, or go back to a safe page.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Try again
          </button>

          <Link
            href="/app/estates"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Go to Estates
          </Link>
        </div>

        <details className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Technical details
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
            {error?.message || "Unknown error"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}