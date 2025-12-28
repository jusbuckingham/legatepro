import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          Page not found
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          The page you’re looking for doesn’t exist, or you don’t have access to it.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Go to Estates
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}