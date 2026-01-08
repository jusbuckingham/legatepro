import Link from "next/link";

type PageProps = {
  params: Promise<{ estateId: string }>;
};

export const dynamic = "force-dynamic";

export default async function EstateUtilitiesEditPage({ params }: PageProps) {
  const { estateId } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href={`/app/estates/${estateId}/utilities`}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              ← Back to Utilities
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Utilities Settings</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Configure default utility providers and preferences for this estate.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/app/estates/${estateId}/utilities`}
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white opacity-60"
            title="Wire this to a save action when ready"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-neutral-900">Default providers</h2>
          <p className="mt-1 text-sm text-neutral-600">
            These defaults can be used when you create new properties or add utility accounts.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Electric</span>
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., DTE Energy"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Gas</span>
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., Consumers Energy"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Water</span>
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., City Water Department"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Internet</span>
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., Comcast Xfinity"
                defaultValue=""
              />
            </label>
          </div>

          <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            <span className="font-medium">Note:</span> This page is UI-polished and ready for wiring.
            When you’re ready, we can connect these fields to your estate settings model (or a
            dedicated utilities-settings document) and enable “Save changes.”
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-neutral-900">Preferences</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Optional defaults for reminders and record keeping.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Default due day</span>
              <input
                type="number"
                min={1}
                max={31}
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., 15"
                defaultValue={undefined}
              />
              <span className="text-xs text-neutral-500">Used to prefill new utility entries.</span>
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-900">Reminder lead time (days)</span>
              <input
                type="number"
                min={0}
                max={30}
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                placeholder="e.g., 3"
                defaultValue={undefined}
              />
              <span className="text-xs text-neutral-500">How many days before due date to remind.</span>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3">
              <input type="checkbox" className="mt-1 h-4 w-4" defaultChecked={false} />
              <div className="grid gap-1">
                <span className="text-sm font-medium text-neutral-900">Require attachments</span>
                <span className="text-sm text-neutral-600">
                  Encourage uploading bills/receipts when recording utility payments.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-neutral-200 p-3">
              <input type="checkbox" className="mt-1 h-4 w-4" defaultChecked={false} />
              <div className="grid gap-1">
                <span className="text-sm font-medium text-neutral-900">Auto-tag activities</span>
                <span className="text-sm text-neutral-600">
                  When enabled, utility changes will appear more prominently in the estate timeline.
                </span>
              </div>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}