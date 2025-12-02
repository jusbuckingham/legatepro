import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { WorkspaceSettings } from "@/models/WorkspaceSettings";
import { WorkspaceSettingsForm } from "@/components/settings/WorkspaceSettingsForm";

export const metadata = {
  title: "Workspace Settings — LegatePro",
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
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure your firm branding and billing defaults. These values feed
          into invoices and other parts of LegatePro.
        </p>
      </div>

      <WorkspaceSettingsForm initial={initial} />
    </div>
  );
}