// Lightweight client-side toast event emitter (UI-agnostic).

export const TOAST_KINDS = ["success", "error", "info"] as const;
export type ToastKind = (typeof TOAST_KINDS)[number];

export type ToastPayload = {
  kind: ToastKind;
  title: string;
  message?: string;
  durationMs?: number;
};

const TOAST_EVENT = "legatepro:toast";

export function emitToast(payload: ToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export const toast = Object.freeze({
  success(title: string, message?: string, durationMs = 3500) {
    emitToast({ kind: "success", title, message, durationMs });
  },
  error(title: string, message?: string, durationMs = 6000) {
    emitToast({ kind: "error", title, message, durationMs });
  },
  info(title: string, message?: string, durationMs = 3500) {
    emitToast({ kind: "info", title, message, durationMs });
  },
});

export function getToastEventName(): string {
  return TOAST_EVENT;
}