"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getApiErrorMessage, safeJson } from "@/lib/utils";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type LinkedContact = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

type AvailableContact = {
  _id: string;
  name: string;
  role?: string;
};

type EstateContactsPanelProps = {
  estateId: string;
  linkedContacts: LinkedContact[];
  availableContacts: AvailableContact[];
};

function formatRole(role?: string): string {
  if (!role) return "—";
  const upper = role.toUpperCase();
  switch (upper) {
    case "EXECUTOR":
      return "Executor";
    case "ADMINISTRATOR":
      return "Administrator";
    case "HEIR":
      return "Heir / Beneficiary";
    case "ATTORNEY":
      return "Attorney";
    case "CREDITOR":
      return "Creditor";
    case "VENDOR":
      return "Vendor";
    case "OTHER":
      return "Other";
    default:
      return role;
  }
}

export function EstateContactsPanel({
  estateId,
  linkedContacts: initialLinked,
  availableContacts: initialAvailable,
}: EstateContactsPanelProps) {
  const [linkedContacts, setLinkedContacts] =
    useState<LinkedContact[]>(initialLinked);
  const [availableContacts, setAvailableContacts] =
    useState<AvailableContact[]>(initialAvailable);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const busy = linking || unlinkingId !== null;

  const canLink = !busy && selectedContactId.length > 0 && availableContacts.length > 0;

  const sortedAvailableContacts = useMemo(() => {
    return availableContacts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availableContacts]);

  const readOkResponse = async (
    res: Response,
  ): Promise<{ ok?: boolean; error?: string } | null> => {
    return (await safeJson(res)) as { ok?: boolean; error?: string } | null;
  };

  const handleLink = async () => {
    if (!selectedContactId) {
      setError("Select a contact to link.");
      return;
    }

    setLinking(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}/contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: selectedContactId }),
          credentials: "include",
          cache: "no-store",
        },
      );

      const resForError = res.clone();
      const data = await readOkResponse(res);

      if (!res.ok || data?.ok !== true) {
        const msg = data?.error || (await getApiErrorMessage(resForError));
        setError(msg || "Failed to link contact.");
        return;
      }

      const contactToLink = availableContacts.find((c) => c._id === selectedContactId);

      if (!contactToLink) {
        setError("Selected contact is no longer available.");
        return;
      }

      setAvailableContacts((prev) => prev.filter((c) => c._id !== selectedContactId));

      setLinkedContacts((prev) => [
        ...prev,
        {
          _id: contactToLink._id,
          name: contactToLink.name,
          role: contactToLink.role,
        },
      ]);

      setSelectedContactId("");
      setSuccess("Contact linked.");
    } catch {
      setError("Something went wrong while linking. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (contactId: string) => {
    setUnlinkingId(contactId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `/api/estates/${encodeURIComponent(estateId)}/contacts?contactId=${encodeURIComponent(contactId)}`,
        {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        }
      );

      const resForError = res.clone();
      const data = await readOkResponse(res);

      if (!res.ok || data?.ok !== true) {
        const msg = data?.error || (await getApiErrorMessage(resForError));
        setError(msg || "Failed to unlink contact.");
        return;
      }

      const contactToUnlink = linkedContacts.find((c) => c._id === contactId) ?? null;

      if (!contactToUnlink) {
        setError("Contact is no longer linked.");
        return;
      }

      setLinkedContacts((prev) => prev.filter((c) => c._id !== contactId));

      setAvailableContacts((prev) => [
        ...prev,
        {
          _id: contactToUnlink._id,
          name: contactToUnlink.name,
          role: contactToUnlink.role,
        },
      ]);
      setSuccess("Contact removed.");
    } catch {
      setError("Something went wrong while unlinking. Please try again.");
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4"
      aria-busy={busy}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            People on this estate
          </h2>
          <p className="text-xs text-slate-400">
            Link executors, heirs, attorneys, and other key contacts.
          </p>
        </div>
      </div>

      {error && (
        <p
          className="text-xs text-red-400"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      {success && !error && (
        <p className="text-xs text-emerald-400" role="status" aria-live="polite">
          {success}
        </p>
      )}

      {/* Link existing contact */}
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-800 pb-3">
        <div className="min-w-[200px] flex-1">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Link existing contact
          </label>
          <select
            value={selectedContactId}
            onChange={(e) => {
              setError(null);
              if (success) setSuccess(null);
              setSelectedContactId(e.target.value);
            }}
            disabled={busy}
            aria-disabled={busy}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">
              {availableContacts.length === 0
                ? "No more contacts to link"
                : "Select a contact…"}
            </option>
            {sortedAvailableContacts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.role ? ` — ${formatRole(c.role)}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!canLink}
          aria-disabled={!canLink}
          onClick={handleLink}
          className={cx(
            "rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950",
            "hover:bg-sky-400 disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          )}
        >
          {linking ? "Linking…" : "Link contact"}
        </button>
      </div>

      {/* Linked contacts list */}
      {linkedContacts.length === 0 ? (
        <p className="text-xs text-slate-500">
          No contacts are linked to this estate yet.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {linkedContacts
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between gap-2 border-b border-slate-900 pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">
                      {c.name}
                    </span>
                    {c.role && (
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {formatRole(c.role)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {c.email && <span>{c.email}</span>}
                    {c.email && c.phone && <span> · </span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-disabled={busy}
                  onClick={() => handleUnlink(c._id)}
                  className={cx(
                    "text-[11px] text-slate-400",
                    "hover:text-red-400 disabled:opacity-60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  )}
                >
                  {unlinkingId === c._id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-500">
        Need a new person?{" "}
        <Link
          href="/app/contacts/new"
          className="text-sky-400 hover:text-sky-300"
        >
          Create a contact
        </Link>{" "}
        first, then link them here.
      </p>
    </section>
  );
}