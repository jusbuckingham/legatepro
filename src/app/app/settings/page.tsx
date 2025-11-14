export default function SettingsPage() {
  return (
    <div className="space-y-8 p-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500">
        <span className="text-slate-500">Account</span>
        <span className="mx-1 text-slate-600">/</span>
        <span className="text-rose-300">Settings</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          Account settings
        </h1>
        <p className="text-sm text-slate-400 max-w-xl">
          Manage your profile, workspace defaults, data preferences, and future
          account features. Most features are read‑only until billing launches.
        </p>
      </div>

      {/* Account Section */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 space-y-4 shadow-sm shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Account
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Profile information, email preferences, and authentication options.
            </p>
          </div>
          <span className="rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase text-rose-100 tracking-wide">
            MVP: read‑only
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Profile</p>
              <p className="text-xs text-slate-500">
                Name, email, and login settings
              </p>
            </div>
            <button
              disabled
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>
        </div>
      </section>

      {/* Workspace Defaults */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 space-y-4 shadow-sm shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Workspace defaults
            </h2>
            <p className="mt-1 text-sm text-slate-400 max-w-lg">
              Set your default hourly rate, notification settings, and
              court‑related preferences. These apply to new estates automatically.
            </p>
          </div>
          <span className="rounded-full border border-amber-500/40 bg-amber-900/40 px-3 py-1 text-[11px] font-medium uppercase text-amber-100 tracking-wide">
            Planned update
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Default hourly rate</p>
              <p className="text-xs text-slate-500">
                Used when creating timecard entries
              </p>
            </div>
            <button
              disabled
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <p className="text-sm text-slate-300 font-medium">Notifications</p>
              <p className="text-xs text-slate-500">
                Get alerts for deadlines, receipts, and attorney packet reminders
              </p>
            </div>
            <button
              disabled
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>
        </div>
      </section>

      {/* Data & Export */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 space-y-4 shadow-sm shadow-black/40">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            Data &amp; export
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-md">
            Export your estates, receipts, and court‑ready packets. Perfect for attorneys or backup storage.
          </p>
        </div>

        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300 font-medium">Full workspace export</p>
          <p className="mt-1 text-xs text-slate-500">
            Download all estate data in a single archive
          </p>
          <button
            disabled
            className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>
      </section>
    </div>
  );
}
