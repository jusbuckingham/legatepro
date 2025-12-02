"use client";

import React, { useState } from "react";
import Link from "next/link";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLink = async () => {
    if (!selectedContactId) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/estates/${estateId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContactId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          typeof data.error === "string"
            ? data.error
            : "Failed to link contact.";
        setError(message);
        setBusy(false);
        return;
      }

      setAvailableContacts((prev) => {
        const idx = prev.findIndex((c) => c._id === selectedContactId);
        if (idx === -1) return prev;
        const contact = prev[idx];
        const next = [...prev];
        next.splice(idx, 1);

        setLinkedContacts((linkedPrev) => [
          ...linkedPrev,
          {
            _id: contact._id,
            name: contact.name,
            role: contact.role,
          },
        ]);

        return next;
      });

      setSelectedContactId("");
      setBusy(false);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while linking. Please try again.");
      setBusy(false);
    }
  };

  const handleUnlink = async (contactId: string) => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/estates/${estateId}/contacts?contactId=${encodeURIComponent(
          contactId,
        )}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          typeof data.error === "string"
            ? data.error
            : "Failed to unlink contact.";
        setError(message);
        setBusy(false);
        return;
      }

      setLinkedContacts((prev) => {
        const idx = prev.findIndex((c) => c._id === contactId);
        if (idx === -1) return prev;
        const contact = prev[idx];
        const next = [...prev];
        next.splice(idx, 1);

        setAvailableContacts((availablePrev) => [
          ...availablePrev,
          {
            _id: contact._id,
            name: contact.name,
            role: contact.role,
          },
        ]);

        return next;
      });

      setBusy(false);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while unlinking. Please try again.");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
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
        <p className="text-xs text-red-400">
          {error}
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
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">
              {availableContacts.length === 0
                ? "No more contacts to link"
                : "Select a contact…"}
            </option>
            {availableContacts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.role ? ` — ${formatRole(c.role)}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!selectedContactId || busy}
          onClick={handleLink}
          className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60"
        >
          {busy ? "Working…" : "Link contact"}
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
                  onClick={() => handleUnlink(c._id)}
                  className="text-[11px] text-slate-400 hover:text-red-400 disabled:opacity-60"
                >
                  Remove
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