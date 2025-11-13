

// src/app/app/estates/[estateId]/settings/page.tsx
import { notFound } from "next/navigation";

interface Estate {
  _id: string;
  name?: string;
  decedentName?: string;
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

async function fetchEstate(estateId: string): Promise<Estate | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const url = `${baseUrl}/api/estates?estateId=${encodeURIComponent(estateId)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { estates?: Estate[] };
  const estates = data.estates ?? [];
  return estates[0] ?? null;
}

interface PageProps {
  params: { estateId: string };
}

export default async function EstateSettingsPage({ params }: PageProps) {
  const { estateId } = params;

  if (!estateId) {
    notFound();
  }

  const estate = await fetchEstate(estateId);

  if (!estate) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Estate Settings
        </h1>
        <p className="text-sm text-gray-500">
          We couldn&apos;t find that estate. It may have been removed or is not
          accessible.
        </p>
      </div>
    );
  }

  const displayName = estate.name || estate.decedentName || "Estate";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estate Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage core details for this estate. These fields are read-only in the
          MVP and will be editable in a future update.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border rounded-lg bg-white shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Basic Information
          </h2>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Display Name</dt>
              <dd className="font-medium text-gray-900 text-right">
                {displayName}
              </dd>
            </div>

            {estate.decedentName && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Decedent</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {estate.decedentName}
                </dd>
              </div>
            )}

            {estate.status && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {estate.status}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="border rounded-lg bg-white shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Court Details
          </h2>

          <dl className="space-y-2 text-sm">
            {estate.caseNumber && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Case Number</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {estate.caseNumber}
                </dd>
              </div>
            )}

            {(estate.courtCounty || estate.courtState) && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Court</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {[estate.courtCounty, estate.courtState]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="border rounded-lg bg-white shadow-sm p-4 space-y-2 text-xs text-gray-500">
        <p>
          Editing estate metadata (name, court details, status) will be available
          in a future version. For now, these values come from your original
          estate setup.
        </p>
      </section>
    </div>
  );
}