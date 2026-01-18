"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeJson } from "@/lib/utils";

interface EstateFormState {
  name: string;
  decedentName: string;
  court: string;
  caseNumber: string;
  city: string;
  state: string;
  dateOfDeath: string;
  notes: string;
}

const initialFormState: EstateFormState = {
  name: "",
  decedentName: "",
  court: "",
  caseNumber: "",
  city: "",
  state: "",
  dateOfDeath: "",
  notes: "",
};

// --- Helper types and functions ---
type PlanId = "free" | "pro";

const BILLING_LIMIT_URL = "/app/billing?reason=estate_limit";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object";
}

function coercePlanId(input: unknown): PlanId | null {
  return input === "free" || input === "pro" ? input : null;
}

function parseBillingPlanId(payload: unknown): PlanId | null {
  if (!isRecord(payload)) return null;

  const data = isRecord(payload.data) ? payload.data : null;
  const subscriptionFromData = data && isRecord(data.subscription) ? data.subscription : null;
  const subscriptionTop = isRecord(payload.subscription) ? payload.subscription : null;

  const planId =
    (subscriptionFromData ? subscriptionFromData.planId : undefined) ??
    (subscriptionTop ? subscriptionTop.planId : undefined);

  return coercePlanId(planId);
}

function parseEstatesCount(payload: unknown): number | null {
  if (!isRecord(payload)) return null;

  const direct = payload.estates;
  const data = isRecord(payload.data) ? payload.data : null;
  const nested1 = data ? (data as UnknownRecord).estates : undefined;
  const nested2 = data ? (data as UnknownRecord).items : undefined;

  const arr = Array.isArray(direct)
    ? direct
    : Array.isArray(nested1)
      ? nested1
      : Array.isArray(nested2)
        ? nested2
        : null;

  if (arr) return arr.length;

  const count =
    payload.count ??
    (data ? (data as UnknownRecord).count : undefined) ??
    (data ? (data as UnknownRecord).total : undefined);

  return typeof count === "number" ? count : null;
}

function computeRequiresUpgrade(planId: PlanId | null, count: number | null): boolean {
  if (planId !== "free") return false;
  if (count == null) return false;
  return count >= 1;
}

export default function NewEstatePage() {
  const router = useRouter();
  const upgradeUrlRef = useRef(BILLING_LIMIT_URL);
  const redirectedRef = useRef(false);

  const getUpgradeUrlFromResponse = useCallback(
    (res: Response, json: unknown): string => {
      const headerUrl = res.headers.get("x-legatepro-upgrade-url");
      if (headerUrl && headerUrl.startsWith("/")) return headerUrl;

      if (
        isRecord(json) &&
        typeof json.upgradeUrl === "string" &&
        json.upgradeUrl.startsWith("/")
      ) {
        return json.upgradeUrl;
      }

      return upgradeUrlRef.current;
    },
    [],
  );

  const redirectToUpgrade = useCallback(
    (target?: string) => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      router.replace(target || upgradeUrlRef.current);
    },
    [router],
  );
  const [form, setForm] = useState<EstateFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EstateFormState, string>>>({});

  // Keep this state type as "free" | "pro" | null
  const [billingPlanId, setBillingPlanId] = useState<"free" | "pro" | null>(null);
  const [estatesCount, setEstatesCount] = useState<number | null>(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);

  const trimmed = useMemo(() => {
    return {
      name: form.name.trim(),
      decedentName: form.decedentName.trim(),
      court: form.court.trim(),
      caseNumber: form.caseNumber.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      dateOfDeath: form.dateOfDeath,
      notes: form.notes.trim(),
    } satisfies EstateFormState;
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const upgradeUrl = upgradeUrlRef.current;

        // Billing snapshot
        const billingRes = await fetch("/api/billing", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        if (billingRes.status === 401) {
          // Session expired / not logged in
          if (!cancelled) router.replace(`/login?next=${encodeURIComponent("/app/estates/new")}`);
          return;
        }

        const billingJson: unknown = await safeJson(billingRes);
        const planId = billingRes.ok ? parseBillingPlanId(billingJson) : null;

        if (!cancelled) {
          setBillingPlanId(planId);
        }

        // Existing estates (best-effort)
        const estatesRes = await fetch("/api/estates", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        if (estatesRes.status === 401) {
          if (!cancelled) router.replace(`/login?next=${encodeURIComponent("/app/estates/new")}`);
          return;
        }

        const estatesJson: unknown = await safeJson(estatesRes);
        const count = estatesRes.ok ? parseEstatesCount(estatesJson) : null;

        if (!cancelled) {
          setEstatesCount(count);

          const shouldUpgrade = computeRequiresUpgrade(planId, count);
          setRequiresUpgrade(shouldUpgrade);

          // Hard redirect: free users hitting /new after already having an estate
          if (shouldUpgrade) {
            redirectToUpgrade(upgradeUrl);
          }
        }
      } catch {
        // Non-fatal: keep UI usable; server will enforce.
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, redirectToUpgrade]);
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));

    if (name === "state") {
      setForm((prev) => ({ ...prev, state: value.toUpperCase().slice(0, 2) }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof EstateFormState, string>> = {};

    if (!trimmed.name) next.name = "Estate name is required.";

    if (trimmed.state && trimmed.state.length !== 2) {
      next.state = "Use a 2-letter state code (e.g., CA, MI).";
    }

    // Basic sanity check: date input should be YYYY-MM-DD when present
    if (trimmed.dateOfDeath && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed.dateOfDeath)) {
      next.dateOfDeath = "Please enter a valid date.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!validate()) return;

    if (requiresUpgrade) {
      redirectToUpgrade();
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/estates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmed.name,
          decedentName: trimmed.decedentName || undefined,
          court: trimmed.court || undefined,
          caseNumber: trimmed.caseNumber || undefined,
          city: trimmed.city || undefined,
          state: trimmed.state || undefined,
          dateOfDeath: trimmed.dateOfDeath || undefined,
          notes: trimmed.notes || undefined,
        }),
      });

      // Extended typing for API response
      const rawJson: unknown = await safeJson(res);
      const data = (rawJson ?? null) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            estate?: { _id?: string };
            code?: string;
            upgradeUrl?: string;
            meta?: { limit?: number; current?: number; planId?: string | null; status?: string | null };
          }
        | null;

      const apiError =
        typeof data?.error === "string" && data.error.trim()
          ? data.error
          : typeof data?.message === "string" && data.message.trim()
          ? data.message
          : null;

      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent("/app/estates/new")}`);
        return;
      }

      // 402 Payment Required: upgrade flow
      if (res.status === 402) {
        setRequiresUpgrade(true);
        setBillingPlanId((prev) => prev ?? "free");

        if (typeof data?.meta?.current === "number") {
          setEstatesCount(data.meta.current);
        }

        const target = getUpgradeUrlFromResponse(res, rawJson);
        redirectToUpgrade(target);
        return;
      }

      if (!res.ok || data?.ok === false) {
        const msg = apiError ?? "Unable to create estate. Please try again.";
        throw new Error(msg);
      }

      const estateId = data?.estate?._id;
      if (estateId) {
        window.location.assign(`/app/estates/${estateId}?created=1`);
      } else {
        window.location.assign("/app/estates?created=1");
      }
    } catch (err) {
      console.error("Error creating estate", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong creating the estate."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            New estate
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Capture the essentials now. You can refine details later inside the estate workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/estates"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/30 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/60"
          >
            Cancel
          </Link>
        </div>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-300">
        <p className="font-medium text-slate-100">Getting started</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          <li><span className="text-slate-200">Estate name</span> is required and should match court paperwork.</li>
          <li>All other fields are optional and can be filled in later.</li>
          <li>You’ll be able to add <span className="text-slate-200">tasks, documents, time, and invoices</span> after creation.</li>
        </ul>
      </div>
      {billingPlanId && typeof estatesCount === "number" ? (
        <p className="text-[11px] text-slate-500">
          Plan: <span className="text-slate-300">{billingPlanId}</span> • Estates: <span className="text-slate-300">{estatesCount}</span>
        </p>
      ) : null}
      {requiresUpgrade ? (
        <div className="rounded-xl border border-[#F15A43]/50 bg-[#F15A43]/10 p-4 text-xs text-[#fbd0c8]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-slate-50">Upgrade required to create another estate</p>
              <p className="mt-1 text-[11px] text-slate-200/80">
                The Starter plan includes <span className="font-semibold text-slate-50">1 active estate workspace</span>.
                Upgrade to Pro to create unlimited estates.
              </p>
              {billingPlanId === "free" && typeof estatesCount === "number" ? (
                <p className="mt-1 text-[11px] text-slate-200/70">Detected: {estatesCount} existing estate workspace{estatesCount === 1 ? "" : "s"}.</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Link
                href={BILLING_LIMIT_URL}
                className="inline-flex items-center justify-center rounded-md bg-[#F15A43] px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm hover:bg-[#f26b56]"
              >
                Upgrade to Pro
              </Link>
              <p className="text-[11px] text-slate-200/70">You can still view and manage your existing estate.</p>
            </div>
          </div>
        </div>
      ) : null}
      <form
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className={`space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-100 shadow-sm shadow-black/40 ${
          isSubmitting ? "pointer-events-none opacity-[0.98]" : ""
        }`}
      >
        {error && (
          <p className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs font-medium text-slate-300">
            Estate name<span className="text-red-400">*</span>
          </label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., Estate of John Q. Doe"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
              fieldErrors.name
                ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
            }`}
          />
          <p className="text-[11px] text-slate-500">
            Use something that matches court paperwork so it’s easy to
            recognize.
          </p>
          {fieldErrors.name ? (
            <p id="name-error" className="text-[11px] text-red-200">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="decedentName"
            className="text-xs font-medium text-slate-300"
          >
            Decedent name
          </label>
          <input
            id="decedentName"
            name="decedentName"
            value={form.decedentName}
            onChange={handleChange}
            placeholder="Full legal name of the decedent"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="court"
              className="text-xs font-medium text-slate-300"
            >
              Court
            </label>
            <input
              id="court"
              name="court"
              value={form.court}
              onChange={handleChange}
              placeholder="e.g., LA County Superior Court – Probate"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="caseNumber"
              className="text-xs font-medium text-slate-300"
            >
              Case number
            </label>
            <input
              id="caseNumber"
              name="caseNumber"
              value={form.caseNumber}
              onChange={handleChange}
              placeholder="Court’s case number"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="city"
              className="text-xs font-medium text-slate-300"
            >
              City
            </label>
            <input
              id="city"
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="Primary city for the estate"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="state"
              className="text-xs font-medium text-slate-300"
            >
              State
            </label>
            <input
              id="state"
              name="state"
              value={form.state}
              onChange={handleChange}
              placeholder="e.g., CA"
              maxLength={2}
              inputMode="text"
              autoCapitalize="characters"
              aria-invalid={Boolean(fieldErrors.state)}
              aria-describedby={fieldErrors.state ? "state-error" : undefined}
              className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
                fieldErrors.state
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
              }`}
            />
            {fieldErrors.state ? (
              <p id="state-error" className="text-[11px] text-red-200">
                {fieldErrors.state}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="dateOfDeath"
              className="text-xs font-medium text-slate-300"
            >
              Date of death
            </label>
            <input
              id="dateOfDeath"
              name="dateOfDeath"
              type="date"
              value={form.dateOfDeath}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.dateOfDeath)}
              aria-describedby={fieldErrors.dateOfDeath ? "dod-error" : "dod-help"}
              className={`w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:ring-1 ${
                fieldErrors.dateOfDeath
                  ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/40"
                  : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/60"
              }`}
            />
            <p id="dod-help" className="text-[11px] text-slate-500">
              Optional — add it now or later.
            </p>
            {fieldErrors.dateOfDeath ? (
              <p id="dod-error" className="text-[11px] text-red-200">
                {fieldErrors.dateOfDeath}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="notes"
              className="text-xs font-medium text-slate-300"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional information or notes"
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={isSubmitting || requiresUpgrade}
            className="inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500"
          >
            {requiresUpgrade ? "Upgrade to create another estate" : isSubmitting ? "Creating…" : "Create estate"}
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/app/estates"
              className="text-xs font-medium text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
            >
              Back to estates
            </Link>
            <p className="text-[11px] text-slate-500">
              You can add documents, notes, tasks, invoices, and contacts after creation.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}