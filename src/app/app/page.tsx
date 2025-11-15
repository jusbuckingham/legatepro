import Link from "next/link";

export default function AppHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Workspace</h1>
      <h2 className="text-2xl font-semibold tracking-tight">Estate Workspace</h2>

      <p className="text-sm text-slate-400 max-w-prose">
        Manage everything in one place — estates, tasks, documents, expenses, properties, rent, and your timecard. Select an estate from the sidebar or create a new one to begin.
      </p>

      <div className="mt-4">
        <Link
          href="/app/estates/new"
          className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          ➕ Create new estate
        </Link>
      </div>
    </div>
  );
}
