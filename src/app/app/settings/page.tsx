import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";
import Link from "next/link";

export const metadata = {
  title: "Settings — LegatePro",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  let settings = await WorkspaceSettings.findOne({
    ownerId: session.user.id,
  });

  if (!settings) {
    settings = new WorkspaceSettings({
      ownerId: session.user.id,
    });
    await settings.save();
  }

  const initial = {
    firmName: settings.firmName ?? "",
    firmAddressLine1: settings.firmAddressLine1 ?? "",
    firmAddressLine2: settings.firmAddressLine2 ?? "",
    firmCity: settings.firmCity ?? "",
    firmState: settings.firmState ?? "",
    firmPostalCode: settings.firmPostalCode ?? "",
    firmCountry: settings.firmCountry ?? "",
    defaultHourlyRateCents:
      typeof settings.defaultHourlyRateCents === "number"
        ? settings.defaultHourlyRateCents
        : null,
    defaultInvoiceTerms: settings.defaultInvoiceTerms ?? "NET_30",
    defaultCurrency: settings.defaultCurrency ?? "USD",
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <nav className="text-xs text-slate-500">
            <span className="text-slate-500">App</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Settings</span>
          </nav>

          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Settings
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Set your firm branding and default billing values. These defaults
              flow into invoices and other areas across LegatePro.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/billing"
            className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/60"
          >
            Billing
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {/* Helpful callout */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-100">
            Invoice defaults live here
          </p>
          <p className="text-xs text-slate-400">
            Tip: set your default hourly rate and invoice terms once—each new
            invoice will start with these values.
          </p>
        </div>
      </div>

      {/* Form */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Workspace profile
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              This info is used for invoice headers, PDFs, and your internal
              defaults.
            </p>
          </div>
        </div>

        <WorkspaceSettingsForm initial={initial} />
      </section>

      {/* Footer note */}
      <p className="text-[11px] text-slate-500">
        Need to manage your subscription or payment method? Head to {" "}
        <Link
          href="/app/billing"
          className="text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
        >
          Billing
        </Link>
        .
      </p>
    </div>
  );
}