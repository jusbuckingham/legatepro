import { connectToDatabase } from "../../../../../lib/db";
import { Estate } from "../../../../../models/Estate";
import { formatDate } from "../../../../../lib/utils";

interface EstateSettingsShape {
  _id: unknown;
  decedentName?: string | null;
  caseNumber?: string | null;
  courtName?: string | null;
  dateOfDeath?: Date | string | null;
  openedAt?: Date | string | null;
  status?: string | null;
}

interface PageProps {
  // In Next 15/16, dynamic params are a Promise
  params: Promise<{
    estateId: string;
  }>;
}

async function loadEstate(estateId: string): Promise<EstateSettingsShape | null> {
  await connectToDatabase();

  if (!estateId) return null;

  try {
    // IMPORTANT: no owner filter here – just find by id
    const estate = await Estate.findById(estateId).lean<EstateSettingsShape | null>();
    return estate;
  } catch (error) {
    // Gracefully handle invalid ObjectId values (e.g. placeholder ids)
    console.error("Failed to load estate by id", estateId, error);
    return null;
  }
}

export default async function EstateSettingsPage({ params }: PageProps) {
  const { estateId } = await params;

  const estate = await loadEstate(estateId);

  if (!estate) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Estate settings</h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find that estate. It may have been removed or is not
          accessible.
        </p>
      </section>
    );
  }

  const decedentName = estate.decedentName ?? "Unknown";
  const caseNumber = estate.caseNumber ?? "Not set";
  const courtName = estate.courtName ?? "Not set";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">
          Settings for Estate of {decedentName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Update core information about this estate. Changes here will be
          reflected across your workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium">Case details</h3>
          <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <dt className="flex-1">Case number</dt>
              <dd className="flex-1 text-right font-medium text-foreground">
                {caseNumber}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex-1">Court</dt>
              <dd className="flex-1 text-right font-medium text-foreground">
                {courtName}
              </dd>
            </div>
            {estate.dateOfDeath && (
              <div className="flex items-center justify-between">
                <dt className="flex-1">Date of death</dt>
                <dd className="flex-1 text-right font-medium text-foreground">
                  {formatDate(estate.dateOfDeath)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium">Status</h3>
          <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <dt className="flex-1">Current status</dt>
              <dd className="flex-1 text-right font-medium text-foreground">
                {estate.status ?? "OPEN"}
              </dd>
            </div>
            {estate.openedAt && (
              <div className="flex items-center justify-between">
                <dt className="flex-1">Opened</dt>
                <dd className="flex-1 text-right font-medium text-foreground">
                  {formatDate(estate.openedAt)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Later we can swap this for a full edit form.
          For now it proves the route + DB lookup are correct. */}
    </section>
  );
}