"use client";

import React, { useState } from "react";
import Link from "next/link";
import { getApiErrorMessage } from "@/lib/utils";

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

  const busy = linking || unlinkingId !== null;

  const handleLink = async () => {
    if (!selectedContactId) return;

    setLinking(true);
    setError(null);

    try {
      const res = await fetch(`/api/estates/${estateId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContactId }),
      });

      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.ok) {
        const msg = data?.error || (await getApiErrorMessage(res));
        setError(msg || "Failed to link contact.");
        return;
      }

      const contactToLink = availableContacts.find(
        (c) => c._id === selectedContactId,
      );

      if (!contactToLink) {
        setError("Selected contact is no longer available.");
        return;
      }

      setAvailableContacts((prev) =>
        prev.filter((c) => c._id !== selectedContactId),
      );

      setLinkedContacts((prev) => [
        ...prev,
        {
          _id: contactToLink._id,
          name: contactToLink.name,
          role: contactToLink.role,
        },
      ]);

      setSelectedContactId("");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while linking. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (contactId: string) => {
    setUnlinkingId(contactId);
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

      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.ok) {
        const msg = data?.error || (await getApiErrorMessage(res));
        setError(msg || "Failed to unlink contact.");
        return;
      }

      const contactToUnlink = linkedContacts.find((c) => c._id === contactId);

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
    } catch (err) {
      console.error(err);
      setError("Something went wrong while unlinking. Please try again.");
    } finally {
      setUnlinkingId(null);
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
        <p
          className="text-xs text-red-400"
          role="alert"
          aria-live="polite"
        >
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
            disabled={busy}
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
                  disabled={unlinkingId === c._id}
                  onClick={() => handleUnlink(c._id)}
                  className="text-[11px] text-slate-400 hover:text-red-400 disabled:opacity-60"
                >
                  {busy && unlinkingId === c._id ? "Removing…" : "Remove"}
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