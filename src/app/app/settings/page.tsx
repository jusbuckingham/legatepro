import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import PageHeader from "@/components/layout/PageHeader";
import PageSection from "@/components/layout/PageSection";
import Link from "next/link";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";

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
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-8">
      <PageHeader
        eyebrow={
          <span className="text-slate-400">
            <span className="text-slate-500">App</span>
            <span className="mx-1 text-slate-600">/</span>
            <span className="text-slate-300">Settings</span>
          </span>
        }
        title="Settings"
        description="Set your firm branding and default billing values. These defaults flow into invoices and other areas across LegatePro."
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
        }
      />

      <PageSection
        title="Invoice defaults live here"
        description="Tip: set your default hourly rate and invoice terms once—each new invoice will start with these values."
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
      >
        <p className="text-sm text-slate-200">
          Set your defaults once and keep moving—new invoices will pick them up automatically.
        </p>
      </PageSection>

      <PageSection
        title="Workspace profile"
        description="This info is used for invoice headers, PDFs, and your internal defaults."
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm"
      >
        <WorkspaceSettingsForm initial={initial} />
      </PageSection>

      <PageSection
        title="Account"
        description="Your personal account details."
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
      >
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="text-xs text-slate-400">Email</div>
          <div className="text-sm text-slate-100">{session.user.email ?? "—"}</div>
          <div className="text-xs text-slate-400">User ID</div>
          <div className="text-sm text-slate-100">{session.user.id}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/api/auth/signout?callbackUrl=/login"
            className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/60"
          >
            Sign out
          </Link>
        </div>
      </PageSection>

      <PageSection
        title="Security"
        description="Manage sign-in and security-related actions."
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
      >
        <div className="mt-4">
          <Link
            href="/api/auth/signin"
            className="inline-block rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/20"
          >
            Manage sign-in
          </Link>
          <p className="mt-2 text-xs text-slate-400">
            Use this to review available sign-in options. Password reset behavior depends on your auth provider.
          </p>
        </div>
      </PageSection>

      <p className="text-[11px] text-slate-500">
        Need to manage your subscription or payment method? Head to{" "}
        <Link
          href="/app/billing"
          className="text-slate-300 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Billing
        </Link>
        .
      </p>
    </div>
  );
}