"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteEstateButtonProps {
  estateId: string;
  estateTitle?: string;
}

export function DeleteEstateButton({
  estateId,
  estateTitle
}: DeleteEstateButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    setError(null);

    const label = estateTitle || "this estate";
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${label}? This cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/estates/${estateId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        let message = "Failed to delete estate.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // ignore JSON parse errors
        }
        setError(message);
        setIsDeleting(false);
        return;
      }

      // On success, go back to the estates list
      router.push("/app/estates");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Unexpected error while deleting estate.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center rounded-lg border border-rose-500 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span className="text-[11px] text-rose-400 max-w-xs">{error}</span>
      )}
    </div>
  );
}