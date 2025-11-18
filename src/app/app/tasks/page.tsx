import Link from "next/link";

export default function TasksLandingPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Tasks
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Tasks workspace
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          To view tasks, open an estate and go to{" "}
          <span className="font-medium text-slate-200">Tasks</span> in the
          estate navigation.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
        <p>
          Start by choosing an estate from the{" "}
          <Link
            href="/app/estates"
            className="font-medium text-emerald-400 hover:text-emerald-300"
          >
            Estates
          </Link>{" "}
          tab. Each estate has its own dedicated task list.
        </p>
      </div>
    </div>
  );
}