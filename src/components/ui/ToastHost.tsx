"use client";

import { useEffect, useMemo, useState } from "react";
import { getToastEventName, type ToastPayload } from "@/lib/toast";

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
    <div className="fixed right-4 top-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => {
        const border =
          t.kind === "success"
            ? "border-green-200"
            : t.kind === "error"
              ? "border-red-200"
              : "border-gray-200";

        const bg =
          t.kind === "success"
            ? "bg-green-50"
            : t.kind === "error"
              ? "bg-red-50"
              : "bg-white";

        const title =
          t.kind === "success"
            ? "text-green-900"
            : t.kind === "error"
              ? "text-red-900"
              : "text-gray-900";

        const body =
          t.kind === "success"
            ? "text-green-800"
            : t.kind === "error"
              ? "text-red-800"
              : "text-gray-700";

        return (
          <div key={t.id} className={`rounded-md border ${border} ${bg} p-3 shadow-sm`}>
            <div className={`text-sm font-semibold ${title}`}>{t.title}</div>
            {t.message ? <div className={`mt-1 text-sm ${body}`}>{t.message}</div> : null}
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="mt-2 text-xs font-semibold text-gray-700 hover:text-gray-900"
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}