// src/lib/assertEnv.ts
// Centralized environment variable validation for server-side runtime code.

export type EnvSpec = {
  key: string;
  required?: boolean;
  // Optional human-readable hint for how/where this is used.
  hint?: string;
};

export class EnvError extends Error {
  public readonly missing: string[];
  constructor(message: string, missing: string[]) {
    super(message);
    this.name = "EnvError";
    this.missing = missing;
  }
}

/**
 * Throws an EnvError if required environment variables are missing.
 * Call this from server-only entry points (db/auth/webhooks).
 */
export function assertEnv(specs: Array<string | EnvSpec>): void {
  const normalized: EnvSpec[] = specs.map((s) => {
    if (typeof s === "string") {
      return { key: s, required: true };
    }
    return { required: s.required !== false, key: s.key, hint: s.hint };
  });

  const missing = normalized
    .filter((s) => s.required !== false)
    .map((s) => s.key)
    .filter((k) => {
      const v = process.env[k];
      return !v || String(v).trim().length === 0;
    });

  if (missing.length > 0) {
    const lines: string[] = [];
    lines.push("Missing required environment variables:");
    for (const key of missing) lines.push(`- ${key}`);

    const hints = normalized
      .filter((s) => missing.includes(s.key) && s.hint)
      .map((s) => `- ${s.key}: ${s.hint}`);

    if (hints.length) {
      lines.push("");
      lines.push("Hints:");
      lines.push(...hints);
    }

    throw new EnvError(lines.join("\n"), missing);
  }
}

/** Convenience accessor that guarantees a non-empty value at runtime. */
export function env(key: string): string {
  const v = process.env[key];
  if (!v || String(v).trim().length === 0) {
    throw new EnvError(`Missing required environment variable: ${key}`, [key]);
  }
  return v;
}
