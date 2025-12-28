"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/lib/utils";

type TaskStatus = "OPEN" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

type TaskFormMode = "create" | "edit";

export interface TaskFormInitialValues {
  subject: string;
  description?: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  date?: string; // ISO date string yyyy-mm-dd
}

interface TaskFormProps {
  estateId: string;
  mode?: TaskFormMode;
  taskId?: string;
  initialValues?: Partial<TaskFormInitialValues>;
}

const DEFAULT_VALUES: TaskFormInitialValues = {
  subject: "",
  description: "",
  notes: "",
  status: "OPEN",
  priority: "MEDIUM",
  date: "",
};

export function TaskForm({
  estateId,
  mode = "create",
  taskId,
  initialValues = {},
}: TaskFormProps) {
  const router = useRouter();

  const [values, setValues] = useState<TaskFormInitialValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";

  const handleChange = (
    field: keyof TaskFormInitialValues,
    value: string
  ) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const endpoint = isEdit && taskId
        ? `/api/estates/${estateId}/tasks/${taskId}`
        : `/api/estates/${estateId}/tasks`;

      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: values.subject,
          description: values.description,
          notes: values.notes,
          status: values.status,
          priority: values.priority,
          date: values.date || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok !== true) {
        const msg =
          data?.error ||
          (await getApiErrorMessage(res)) ||
          "Failed to save task";
        throw new Error(msg);
      }

      router.push(`/app/estates/${estateId}/tasks`);
      router.refresh();
    } catch (err) {
      console.error("[TaskForm] submit error:", err);
      setError(
        err instanceof Error ? err.message : "Something went wrong saving task"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/app/estates/${estateId}/tasks`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-sm">
      {error && (
        <div className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Subject */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Task subject <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={values.subject}
          onChange={(e) => handleChange("subject", e.target.value)}
          placeholder="e.g. File inventory with the court"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Description
        </label>
        <textarea
          value={values.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={3}
          placeholder="Add more detail about what needs to be done, steps, and context."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Internal notes
        </label>
        <textarea
          value={values.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
          placeholder="Private notes for yourself—court calls, phone logs, etc."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
        />
      </div>

      {/* Status / Priority / Date */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Status */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Status
          </label>
          <select
            value={values.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          >
            <option value="OPEN">Open</option>
            <option value="DONE">Done</option>
          </select>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Priority
          </label>
          <select
            value={values.priority}
            onChange={(e) => handleChange("priority", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Due date
          </label>
          <input
            type="date"
            value={values.date ?? ""}
            onChange={(e) => handleChange("date", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-900"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
            ? "Save changes"
            : "Create task"}
        </button>
      </div>
    </form>
  );
}