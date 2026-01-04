"use client";

import { FormEvent, useMemo, useState } from "react";
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
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string }>({});

  const isEdit = mode === "edit" && Boolean(taskId);

  const subjectTrimmed = useMemo(() => values.subject.trim(), [values.subject]);
  const canSubmit = !isSubmitting && subjectTrimmed.length > 0;

  const handleChange = (field: keyof TaskFormInitialValues, value: string): void => {
    // Clear any previous banner error as soon as the user edits again.
    if (error) setError(null);

    // Clear field-level error once the user edits the field.
    setFieldErrors((prev) => {
      if (!prev[field as "subject"]) return prev;
      const next = { ...prev };
      delete next[field as "subject"];
      return next;
    });

    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!subjectTrimmed) {
      setFieldErrors({ subject: "Task subject is required." });
      setError("Task subject is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    const safeEstateId = encodeURIComponent(estateId);
    const safeTaskId = taskId ? encodeURIComponent(taskId) : null;

    try {
      const endpoint = isEdit && safeTaskId
        ? `/api/estates/${safeEstateId}/tasks/${safeTaskId}`
        : `/api/estates/${safeEstateId}/tasks`;

      const method = isEdit && safeTaskId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: subjectTrimmed,
          description: values.description?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          status: values.status,
          priority: values.priority,
          date: values.date || null,
        }),
      });

      const data = (await res
        .json()
        .catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || data?.ok !== true) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(res));
        const message = data?.error || apiMessage || "Failed to save task.";
        setError(message);
        return;
      }

      router.push(`/app/estates/${safeEstateId}/tasks`);
      router.refresh();
    } catch (err) {
      // Avoid noisy console output in production; show a friendly message.
      const message = err instanceof Error ? err.message : "Network error while saving task.";
      setError(message || "Network error while saving task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    const safeEstateId = encodeURIComponent(estateId);
    router.push(`/app/estates/${safeEstateId}/tasks`);
  };

  return (
    <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-6 text-sm">
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {/* Subject */}
      <div className="space-y-1.5">
        <label
          htmlFor="task-subject"
          className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
        >
          Task subject <span className="text-red-400">*</span>
        </label>
        <input
          id="task-subject"
          name="subject"
          type="text"
          value={values.subject}
          onChange={(e) => handleChange("subject", e.target.value)}
          onBlur={() => {
            // Normalize accidental whitespace-only subjects
            if (values.subject !== subjectTrimmed) handleChange("subject", subjectTrimmed);
          }}
          placeholder="e.g. File inventory with the court"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          required
          aria-invalid={Boolean(fieldErrors.subject)}
          aria-describedby={fieldErrors.subject ? "task-subject-error" : "task-subject-help"}
          disabled={isSubmitting}
        />
        <p id="task-subject-help" className="text-[11px] text-slate-500">
          Short and specific is best (e.g. “Call probate clerk to confirm filing”).
        </p>
        {fieldErrors.subject && (
          <p id="task-subject-error" className="text-[11px] text-red-300" role="alert">
            {fieldErrors.subject}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label
          htmlFor="task-description"
          className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
        >
          Description
        </label>
        <textarea
          id="task-description"
          name="description"
          value={values.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={3}
          placeholder="Add more detail about what needs to be done, steps, and context."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          disabled={isSubmitting}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label
          htmlFor="task-notes"
          className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
        >
          Internal notes
        </label>
        <textarea
          id="task-notes"
          name="notes"
          value={values.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
          placeholder="Private notes for yourself—court calls, phone logs, etc."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
          disabled={isSubmitting}
        />
      </div>

      {/* Status / Priority / Date */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Status */}
        <div className="space-y-1.5">
          <label
            htmlFor="task-status"
            className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
          >
            Status
          </label>
          <select
            id="task-status"
            name="status"
            value={values.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
            disabled={isSubmitting}
          >
            <option value="OPEN">Open</option>
            <option value="DONE">Done</option>
          </select>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label
            htmlFor="task-priority"
            className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
          >
            Priority
          </label>
          <select
            id="task-priority"
            name="priority"
            value={values.priority}
            onChange={(e) => handleChange("priority", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
            disabled={isSubmitting}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <label
            htmlFor="task-date"
            className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400"
          >
            Due date
          </label>
          <input
            type="date"
            id="task-date"
            name="date"
            value={values.date ?? ""}
            onChange={(e) => handleChange("date", e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/60"
            disabled={isSubmitting}
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
          disabled={!canSubmit}
        >
          {isSubmitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
            ? "Save changes"
            : "Create task"}
        </button>
      </div>
    </form>
  );
}