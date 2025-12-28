export type ToastKind = "success" | "error" | "info";

export type ToastPayload = {
  kind: ToastKind;
  title: string;
  message?: string;
  durationMs?: number;
};

const TOAST_EVENT = "legatepro:toast";

export function emitToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export const toast = {
  success(title: string, message?: string, durationMs = 3500) {
    emitToast({ kind: "success", title, message, durationMs });
  },
  error(title: string, message?: string, durationMs = 6000) {
    emitToast({ kind: "error", title, message, durationMs });
  },
  info(title: string, message?: string, durationMs = 3500) {
    emitToast({ kind: "info", title, message, durationMs });
  },
};

export function getToastEventName() {
  return TOAST_EVENT;
}