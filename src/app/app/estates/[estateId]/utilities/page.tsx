

"use client";

import { useEffect, useState, FormEvent } from "react";

interface UtilityAccount {
  _id: string;
  estateId: string;
  propertyId?: string;
  providerName: string;
  utilityType: string;
  accountNumber?: string;
  phone?: string;
  website?: string;
  balanceDue?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: string;
  notes?: string;
}

interface PageProps {
  params: {
    estateId: string;
  };
}

const UTILITY_TYPES = [
  "ELECTRIC",
  "GAS",
  "WATER",
  "SEWER",
  "TRASH",
  "INTERNET",
  "CABLE",
  "SECURITY",
  "OTHER",
];

export default function EstateUtilitiesPage({ params }: PageProps) {
  const { estateId } = params;

  const [utilities, setUtilities] = useState<UtilityAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [providerName, setProviderName] = useState("");
  const [utilityType, setUtilityType] = useState("ELECTRIC");
  const [accountNumber, setAccountNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [balanceDue, setBalanceDue] = useState("");
  const [lastPaymentAmount, setLastPaymentAmount] = useState("");
  const [lastPaymentDate, setLastPaymentDate] = useState<string>("");
  const [notes, setNotes] = useState("");

  async function loadUtilities() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/utilities?estateId=${encodeURIComponent(estateId)}`);
      if (!res.ok) {
        throw new Error("Failed to load utility accounts");
      }
      const data = await res.json();
      setUtilities(data.utilities ?? []);
    } catch (err) {
      console.error(err);
      setError("Unable to load utility accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUtilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!providerName.trim()) {
      setError("Provider name is required.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estateId,
          providerName,
          utilityType,
          accountNumber: accountNumber || undefined,
          phone: phone || undefined,
          website: website || undefined,
          balanceDue: balanceDue ? Number(balanceDue) : undefined,
          lastPaymentAmount: lastPaymentAmount ? Number(lastPaymentAmount) : undefined,
          lastPaymentDate: lastPaymentDate || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || "Failed to create utility account.";
        throw new Error(msg);
      }

      // Reset form & reload utilities
      setProviderName("");
      setAccountNumber("");
      setPhone("");
      setWebsite("");
      setBalanceDue("");
      setLastPaymentAmount("");
      setLastPaymentDate("");
      setNotes("");
      setUtilityType("ELECTRIC");

      await loadUtilities();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to create utility account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilities</h1>
          <p className="text-sm text-slate-400">
            Track utility accounts for this estate so you can keep services active
            and reconcile final bills.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">
          Add utility account
        </h2>

        <form
          onSubmit={handleSubmit}
          className="grid gap-3 md:grid-cols-4 md:items-end text-sm"
        >
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="providerName" className="text-slate-300">
              Provider name
            </label>
            <input
              id="providerName"
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="DTE Energy, LADWP, Comcast, etc."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="utilityType" className="text-slate-300">
              Type
            </label>
            <select
              id="utilityType"
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              {UTILITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="accountNumber" className="text-slate-300">
              Account #
            </label>
            <input
              id="accountNumber"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-slate-300">
              Phone (optional)
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="website" className="text-slate-300">
              Website (optional)
            </label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="balanceDue" className="text-slate-300">
              Balance due
            </label>
            <input
              id="balanceDue"
              type="number"
              step="0.01"
              min="0"
              value={balanceDue}
              onChange={(e) => setBalanceDue(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="lastPaymentAmount" className="text-slate-300">
              Last payment
            </label>
            <input
              id="lastPaymentAmount"
              type="number"
              step="0.01"
              min="0"
              value={lastPaymentAmount}
              onChange={(e) => setLastPaymentAmount(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="lastPaymentDate" className="text-slate-300">
              Last payment date
            </label>
            <input
              id="lastPaymentDate"
              type="date"
              value={lastPaymentDate}
              onChange={(e) => setLastPaymentDate(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-3">
            <label htmlFor="notes" className="text-slate-300">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save utility"}
            </button>
          </div>
        </form>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Utility accounts</h2>
          <p className="text-xs text-slate-400">Total: {utilities.length}</p>
        </div>

        {loading && utilities.length === 0 ? (
          <p className="text-sm text-slate-400">Loading utilities…</p>
        ) : utilities.length === 0 ? (
          <p className="text-sm text-slate-400">
            No utility accounts yet. Add each active service so nothing gets
            missed when you close the estate.
          </p>
        ) : (
          <div className="overflow-x-auto text-sm">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 text-left">Provider</th>
                  <th className="py-2 pr-4 text-left">Type</th>
                  <th className="py-2 pr-4 text-left">Account #</th>
                  <th className="py-2 pr-4 text-right">Balance due</th>
                  <th className="py-2 pr-4 text-right">Last payment</th>
                  <th className="py-2 pr-0 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {utilities.map((u) => (
                  <tr
                    key={u._id}
                    className="border-b border-slate-800/60 last:border-b-0"
                  >
                    <td className="py-2 pr-4 align-top text-slate-100">
                      {u.providerName}
                    </td>
                    <td className="py-2 pr-4 align-top text-slate-100">
                      {u.utilityType}
                    </td>
                    <td className="py-2 pr-4 align-top text-slate-300">
                      {u.accountNumber || "—"}
                    </td>
                    <td className="py-2 pr-4 align-top text-right text-slate-100">
                      {typeof u.balanceDue === "number"
                        ? `$${u.balanceDue.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 align-top text-right text-slate-100">
                      {typeof u.lastPaymentAmount === "number" ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{`$${u.lastPaymentAmount.toFixed(2)}`}</span>
                          {u.lastPaymentDate && (
                            <span className="text-[11px] text-slate-400">
                              {new Date(u.lastPaymentDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : u.lastPaymentDate ? (
                        new Date(u.lastPaymentDate).toLocaleDateString()
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-0 align-top text-slate-300">
                      {u.notes || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}