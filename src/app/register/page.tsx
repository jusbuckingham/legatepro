"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { getApiErrorMessage, safeJson } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      const data =
        (await safeJson<{ ok?: boolean; error?: string }>(res)) ?? null;

      const apiError =
        typeof data?.error === "string" && data.error.trim() ? data.error : null;

      // Treat non-2xx responses OR explicit ok:false payloads as errors.
      if (!res.ok || data?.ok === false) {
        const msg = apiError ?? (await getApiErrorMessage(res));
        setError(msg || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      // If the API is expected to return { ok: true } on success, enforce it.
      if (data?.ok !== true) {
        setError(apiError || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      // Auto sign-in after successful registration
      const loginRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/"
      });

      if (loginRes?.error) {
        // If auto login fails, just send them to login page
        router.push("/login");
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
          Create your LegatePro account
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Built for fiduciaries, attorneys, and estate professionals.
        </p>

        {error ? (
          <div
            className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600"
            role="status"
            aria-live="polite"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Name
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              placeholder="you@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              placeholder="Create a secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-rose-600 hover:text-rose-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}