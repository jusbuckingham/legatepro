import Link from "next/link";

type PageProps = {
  params: { estateId: string };
};

export const dynamic = "force-dynamic";

export default async function EstateUtilitiesEditPage({ params }: PageProps) {
  const { estateId } = params;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href={`/app/estates/${estateId}/utilities`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Utilities
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Utilities settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set defaults for utility providers and record-keeping preferences for this estate.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              disabled
              aria-disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md border border-border bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground opacity-60 hover:bg-muted/40"
              title="Reset defaults when settings persistence is enabled"
            >
              Reset to defaults
            </button>
            <Link
              href={`/app/estates/${estateId}/utilities`}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled
              aria-disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background opacity-60"
              title="Wire this to a save action when ready"
            >
              Save changes
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Draft settings — saving is disabled until this page is wired to persistence.
          </p>
        </div>
      </div>

      <div className="mb-6 h-px w-full bg-border" />

      <div className="grid gap-6">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Default providers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Used to prefill providers when you add properties or create new utility accounts.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Electric</span>
              <input
                name="electricProvider"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., DTE Energy"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Gas</span>
              <input
                name="gasProvider"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., Consumers Energy"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Water</span>
              <input
                name="waterProvider"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., City Water Department"
                defaultValue=""
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Internet</span>
              <input
                name="internetProvider"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., Comcast Xfinity"
                defaultValue=""
              />
            </label>
          </div>

          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Note:</span> This page is UI-ready for wiring.
            When you’re ready, we can persist these defaults on the estate (or a utilities-settings document)
            and enable “Save changes.”
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional defaults for reminders and record keeping.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Default due day</span>
              <input
                name="defaultDueDay"
                type="number"
                min={1}
                max={31}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., 15"
                defaultValue=""
              />
              <span className="text-xs text-muted-foreground">Used to prefill new utility entries.</span>
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-foreground">Reminder lead time (days)</span>
              <input
                name="reminderLeadDays"
                type="number"
                min={0}
                max={30}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="e.g., 3"
                defaultValue=""
              />
              <span className="text-xs text-muted-foreground">How many days before due date to remind.</span>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3">
              <input
                name="requireAttachments"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                defaultChecked={false}
              />
              <div className="grid gap-1">
                <span className="text-sm font-medium text-foreground">Require attachments</span>
                <span className="text-sm text-muted-foreground">
                  Encourage uploading bills/receipts when recording utility payments.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/20 p-3">
              <input
                name="autoTagActivities"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                defaultChecked={false}
              />
              <div className="grid gap-1">
                <span className="text-sm font-medium text-foreground">Auto-tag activities</span>
                <span className="text-sm text-muted-foreground">
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