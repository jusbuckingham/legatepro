import Link from "next/link";
import { TaskForm } from "@/components/estate/TaskForm";

interface PageProps {
  params: Promise<{
    estateId: string;
  }>;
}

export default async function NewTaskPage({ params }: PageProps) {
  const { estateId } = await params;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Tasks
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            New task
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Create a to-do item for this estate—court filings, follow-ups,
            payments, and more.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/app/estates/${estateId}/tasks`}
            className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:border-slate-500/70 hover:text-slate-100"
          >
            Back to tasks
          </Link>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-sm shadow-black/40 sm:p-6">
        <TaskForm estateId={estateId} mode="create" />
      </div>
    </div>
  );
}