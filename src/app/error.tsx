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
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          Something went wrong
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          This page hit an unexpected error. You can try again, or go back to a safe page.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Try again
          </button>

          <Link
            href="/app/estates"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          >
            Go to Estates
          </Link>
        </div>

        <details className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">
            Technical details
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-700">
            {error?.message || "Unknown error"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}