"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApiErrorMessage } from "@/lib/utils";

interface DeletePropertyButtonProps {
  estateId: string;
  propertyId: string;
  propertyTitle?: string,
}

export function DeletePropertyButton({
  estateId,
  propertyId,
  propertyTitle,
}: DeletePropertyButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    if (isDeleting) return;
    setError(null);

    const label = propertyTitle || "this property";
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${label}? This cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response: Response = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}/properties/${encodeURIComponent(propertyId)}`,
        {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        }
      );

      // Clone before consuming the body so error helpers can still read it.
      const responseForError = response.clone();
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        const apiMessage = await Promise.resolve(
          getApiErrorMessage(responseForError)
        ).catch(() => "");
        const message = data?.error || apiMessage || "Failed to delete property.";
        setError(message);
        return;
      }

      router.push(`/app/estates/${encodeURIComponent(estateId)}/properties`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Unexpected error while deleting property.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1" aria-busy={isDeleting}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center rounded-lg border border-rose-500 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span className="max-w-xs text-[10px] text-rose-400" role="alert" aria-live="polite">{error}</span>
      )}
    </div>
  );
}