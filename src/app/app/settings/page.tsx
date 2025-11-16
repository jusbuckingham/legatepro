import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";

interface WorkspaceSettingsViewModel {
  defaultHourlyRate: string;
  notificationsEnabled: boolean;
}

async function loadWorkspaceSettings(): Promise<WorkspaceSettingsViewModel> {
  try {
    await connectToDatabase();

    const existing = await WorkspaceSettings.findOne().lean<{
      defaultHourlyRate?: number | null;
      notificationsEnabled?: boolean;
    } | null>();

    if (!existing) {
      return {
        defaultHourlyRate: "",
        notificationsEnabled: false,
      };
    }

    return {
      defaultHourlyRate:
        typeof existing.defaultHourlyRate === "number"
          ? existing.defaultHourlyRate.toString()
          : "",
      notificationsEnabled: !!existing.notificationsEnabled,
    };
  } catch (error) {
    // If anything goes wrong, fall back to safe defaults
    console.error("[Settings] Failed to load workspace settings:", error);
    return {
      defaultHourlyRate: "",
      notificationsEnabled: false,
    };
  }
}

async function saveWorkspaceSettings(formData: FormData) {
  "use server";

  const defaultHourlyRateRaw = formData.get("defaultHourlyRate");
  const notificationsRaw = formData.get("notificationsEnabled");

  let defaultHourlyRate: number | null = null;

  if (typeof defaultHourlyRateRaw === "string" && defaultHourlyRateRaw.trim() !== "") {
    const parsed = Number(defaultHourlyRateRaw);

    // Guard against NaN / negative values
    if (!Number.isNaN(parsed) && parsed >= 0) {
      defaultHourlyRate = parsed;
    }
  }

  const notificationsEnabled = notificationsRaw === "on";

  try {
    await connectToDatabase();

    await WorkspaceSettings.findOneAndUpdate(
      {},
      {
        $set: {
          defaultHourlyRate,
          notificationsEnabled,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error("[Settings] Failed to save workspace settings:", error);
    // Optionally: you could throw here and show an error UI in a future iteration
  }

  revalidatePath("/app/settings");
}

export default async function SettingsPage() {
  const settings = await loadWorkspaceSettings();

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
          account features. Workspace defaults below are now saved to your account.
        </p>
      </div>

      {/* Account Section (still read-only for now) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 shadow-sm shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Account
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Profile information, email preferences, and authentication options.
            </p>
          </div>
          <span className="rounded-full border border-rose-500/40 bg-rose-950/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-rose-100">
            MVP: read-only
          </span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">Profile</p>
              <p className="text-xs text-slate-500">
                Name, email, and login settings
              </p>
            </div>
            <button
              disabled
              className="cursor-not-allowed rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500"
            >
              Coming soon
            </button>
          </div>
        </div>
      </section>

      {/* Workspace Defaults – now functional */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 shadow-sm shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
              Workspace defaults
            </h2>
            <p className="mt-1 max-w-lg text-sm text-slate-400">
              Set your default hourly rate and notification preferences. These will
              be used as defaults when you create new estates and time entries.
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-900/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-100">
            Active
          </span>
        </div>

        <form
          action={saveWorkspaceSettings}
          className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4"
        >
          {/* Default hourly rate */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">
                Default hourly rate
              </p>
              <p className="text-xs text-slate-500">
                Used when creating new time entries. You can still override it per
                estate.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">$</span>
              <input
                type="number"
                name="defaultHourlyRate"
                defaultValue={settings.defaultHourlyRate}
                step="0.01"
                min="0"
                className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none ring-0 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              <span className="text-xs text-slate-500">per hour</span>
            </div>
          </div>

          {/* Notifications */}
          <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">Notifications</p>
              <p className="text-xs text-slate-500">
                Get alerts for deadlines, receipts, and attorney packet reminders.
              </p>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="notificationsEnabled"
                defaultChecked={settings.notificationsEnabled}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-500"
              />
              <span className="text-xs text-slate-300">Enable notifications</span>
            </label>
          </div>

          <div className="flex justify-end border-t border-slate-800 pt-4">
            <button
              type="submit"
              className="rounded-md bg-rose-500 px-4 py-1.5 text-sm font-medium text-slate-50 shadow-sm shadow-rose-500/30 transition-colors hover:bg-rose-400"
            >
              Save workspace defaults
            </button>
          </div>
        </form>
      </section>

      {/* Data & Export (still planned) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 shadow-sm shadow-black/40">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-200">
            Data &amp; export
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            Export your estates, receipts, and court-ready packets. Perfect for
            attorneys or backup storage.
          </p>
        </div>

        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm font-medium text-slate-300">
            Full workspace export
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Download all estate data in a single archive
          </p>
          <button
            disabled
            className="mt-3 cursor-not-allowed rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-500"
          >
            Coming soon
          </button>
        </div>
      </section>
    </div>
  );
}