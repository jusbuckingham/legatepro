// src/app/app/estates/page.tsx
import Link from "next/link";
import { Metadata } from "next";
import { connectToDatabase } from "../../../lib/db";
import { Estate } from "../../../models/Estate";
import { StatusDot } from "../../../components/ui/StatusDot";

export const metadata: Metadata = {
  title: "Estates | LegatePro",
};

type EstateListItem = {
  _id: string;
  label: string;
  courtFileNumber?: string;
  county?: string;
  state?: string;
  status: "draft" | "open" | "closing" | "closed";
  createdAt?: string;
  personalRepName?: string;
};

type RawEstate = {
  _id: unknown;
  label?: string;
  decedentName?: string;
  courtFileNumber?: string;
  county?: string;
  state?: string;
  status?: EstateListItem["status"];
  createdAt?: Date | string;
  personalRepName?: string;
};

async function getEstatesForUser(userId: string): Promise<EstateListItem[]> {
  await connectToDatabase();

  const estates = (await Estate.find({ ownerId: userId })
    .sort({ createdAt: -1 })
    .lean()) as RawEstate[];

  return estates.map((e) => {
    const createdAtISO = e.createdAt
      ? e.createdAt instanceof Date
        ? e.createdAt.toISOString()
        : new Date(e.createdAt).toISOString()
      : undefined;

    return {
      _id: String(e._id),
      label: e.label ?? e.decedentName ?? "Untitled estate",
      courtFileNumber: e.courtFileNumber,
      county: e.county,
      state: e.state,
      status: e.status ?? "draft",
      createdAt: createdAtISO,
      personalRepName: e.personalRepName,
    };
  });
}

// TODO: replace with real user ID from auth/session
const MOCK_USER_ID = "demo-user";

export default async function EstatesPage() {
  const estates = await getEstatesForUser(MOCK_USER_ID);

  const hasEstates = estates.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Your estates
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track every probate matter in one clean workspace. Add tasks, time,
            rent, utilities, documents, and more.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/app/estates/new"
            className="inline-flex items-center rounded-md bg-[#b9112b] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#970f24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9112b] focus-visible:ring-offset-2"
          >
            + New estate
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {!hasEstates && (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-white p-8 text-center">
          <h2 className="text-base font-semibold text-neutral-900">
            No estates yet
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Create your first estate to start organizing tasks, costs, rent,
            utilities, and court documents in one place.
          </p>
          <div className="mt-4">
            <Link
              href="/app/estates/new"
              className="inline-flex items-center rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800"
            >
              Start new estate
            </Link>
          </div>
        </div>
      )}

      {/* Table */}
      {hasEstates && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Estate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Court file
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  County / State
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Personal rep
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white">
              {estates.map((estate) => (
                <tr key={estate._id} className="hover:bg-neutral-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-900">
                    <Link
                      href={`/app/estates/${estate._id}`}
                      className="font-medium text-neutral-900 hover:text-[#b9112b]"
                    >
                      {estate.label}
                    </Link>
                    {estate.createdAt && (
                      <div className="mt-0.5 text-xs text-neutral-500">
                        Opened{" "}
                        {new Date(estate.createdAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {estate.courtFileNumber || (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {estate.county || estate.state ? (
                      <>
                        {estate.county && <span>{estate.county}</span>}
                        {estate.county && estate.state && (
                          <span className="text-neutral-400"> · </span>
                        )}
                        {estate.state && <span>{estate.state}</span>}
                      </>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {estate.personalRepName || (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700">
                      <StatusDot
                        color={
                          estate.status === "open"
                            ? "green"
                            : estate.status === "closing"
                            ? "yellow"
                            : estate.status === "closed"
                            ? "gray"
                            : "gray"
                        }
                      />
                      <span className="capitalize">{estate.status}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/estates/${estate._id}`}
                        className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Open workspace
                      </Link>
                      <Link
                        href={`/app/estates/${estate._id}/settings`}
                        className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Settings
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}