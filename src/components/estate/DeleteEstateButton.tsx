"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApiErrorMessage } from "@/lib/utils";

interface DeleteEstateButtonProps {
  estateId: string;
  estateTitle?: string;
}

export function DeleteEstateButton({
  estateId,
  estateTitle,
}: DeleteEstateButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    if (isDeleting) return;

    setError(null);

    const label = estateTitle || "this estate";
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${label}? This cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/estates/${encodeURIComponent(estateId)}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });

      const responseClone = response.clone();
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        const apiMessage = await Promise.resolve(getApiErrorMessage(responseClone));
        const message = data?.error || apiMessage || "Failed to delete estate.";
        setError(message);
        return;
      }

      // On success, go back to the estates list
      router.push("/app/estates");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Unexpected error while deleting estate.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2" aria-busy={isDeleting}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center rounded-lg border border-rose-500 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-[11px] text-rose-400">
          {error}
        </span>
      )}
    </div>
  );
}