export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>

      <p className="text-sm text-slate-400 max-w-prose">
        Manage your account, preferences, and workspace defaults.
      </p>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-slate-100">Account</h3>
        <p className="text-sm text-slate-400">User profile, email, and login preferences.</p>
        <button
          disabled
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
        >
          Coming soon
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <h3 className="text-lg font-semibold text-slate-100">Workspace Defaults</h3>
        <p className="text-sm text-slate-400">Default hourly rate, court preferences, and notification settings.</p>
        <button
          disabled
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500 cursor-not-allowed"
        >
          Coming soon
        </button>
      </div>
    </div>
  );
}
