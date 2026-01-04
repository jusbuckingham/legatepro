"use client";

import { useEffect, useMemo, useState } from "react";
import { getToastEventName, type ToastPayload } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ToastItem = ToastPayload & { id: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ToastHost() {
  const eventName = useMemo(() => getToastEventName(), []);
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<ToastPayload>;
      const payload = ce.detail;
      const id = uid();

      const item: ToastItem = { ...payload, id };
      setItems((prev) => [...prev, item]);

      const duration = payload.durationMs ?? 3500;
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    window.addEventListener(eventName, onToast);
    return () => window.removeEventListener(eventName, onToast);
  }, [eventName]);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((t) => {
        const tone =
          t.kind === "success"
            ? {
                border: "border-emerald-500/40",
                bg: "bg-emerald-950/60",
                title: "text-emerald-200",
                body: "text-emerald-300",
              }
            : t.kind === "error"
            ? {
                border: "border-red-500/40",
                bg: "bg-red-950/60",
                title: "text-red-200",
                body: "text-red-300",
              }
            : {
                border: "border-slate-700",
                bg: "bg-slate-900/80",
                title: "text-slate-100",
                body: "text-slate-300",
              };

        return (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border p-3 shadow-lg backdrop-blur",
              tone.border,
              tone.bg
            )}
          >
            <div className={cn("text-sm font-semibold", tone.title)}>
              {t.title}
            </div>

            {t.message && (
              <div className={cn("mt-1 text-sm", tone.body)}>
                {t.message}
              </div>
            )}

            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setItems((prev) => prev.filter((x) => x.id !== t.id))
              }
              className="mt-2 inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}