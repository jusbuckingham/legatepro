import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import {
  WorkspaceSettings,
  type InvoiceTermsCode,
} from "@/models/WorkspaceSettings";

type SettingsUpdatePayload = {
  firmName?: string | null;
  firmAddressLine1?: string | null;
  firmAddressLine2?: string | null;
  firmCity?: string | null;
  firmState?: string | null;
  firmPostalCode?: string | null;
  firmCountry?: string | null;
  defaultHourlyRateCents?: number | null;
  defaultInvoiceTerms?: InvoiceTermsCode | null;
  defaultCurrency?: string | null;
};

function serialize(settings: InstanceType<typeof WorkspaceSettings>) {
  return {
    ownerId: settings.ownerId,
    firmName: settings.firmName ?? null,
    firmAddressLine1: settings.firmAddressLine1 ?? null,
    firmAddressLine2: settings.firmAddressLine2 ?? null,
    firmCity: settings.firmCity ?? null,
    firmState: settings.firmState ?? null,
    firmPostalCode: settings.firmPostalCode ?? null,
    firmCountry: settings.firmCountry ?? null,
    defaultHourlyRateCents:
      typeof settings.defaultHourlyRateCents === "number"
        ? settings.defaultHourlyRateCents
        : null,
    defaultInvoiceTerms: settings.defaultInvoiceTerms ?? "NET_30",
    defaultCurrency: settings.defaultCurrency ?? "USD",
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  return NextResponse.json(serialize(settings));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SettingsUpdatePayload;
  try {
    payload = (await req.json()) as SettingsUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await connectToDatabase();

  const {
    firmName,
    firmAddressLine1,
    firmAddressLine2,
    firmCity,
    firmState,
    firmPostalCode,
    firmCountry,
    defaultHourlyRateCents,
    defaultInvoiceTerms,
    defaultCurrency,
  } = payload;

  const update: Record<string, unknown> = {};

  if (typeof firmName === "string" || firmName === null) {
    update.firmName = firmName ?? undefined;
  }
  if (typeof firmAddressLine1 === "string" || firmAddressLine1 === null) {
    update.firmAddressLine1 = firmAddressLine1 ?? undefined;
  }
  if (typeof firmAddressLine2 === "string" || firmAddressLine2 === null) {
    update.firmAddressLine2 = firmAddressLine2 ?? undefined;
  }
  if (typeof firmCity === "string" || firmCity === null) {
    update.firmCity = firmCity ?? undefined;
  }
  if (typeof firmState === "string" || firmState === null) {
    update.firmState = firmState ?? undefined;
  }
  if (typeof firmPostalCode === "string" || firmPostalCode === null) {
    update.firmPostalCode = firmPostalCode ?? undefined;
  }
  if (typeof firmCountry === "string" || firmCountry === null) {
    update.firmCountry = firmCountry ?? undefined;
  }

  if (
    typeof defaultHourlyRateCents === "number" ||
    defaultHourlyRateCents === null
  ) {
    update.defaultHourlyRateCents =
      defaultHourlyRateCents ?? undefined;
  }

  if (typeof defaultInvoiceTerms === "string") {
    update.defaultInvoiceTerms = defaultInvoiceTerms;
  }

  if (typeof defaultCurrency === "string") {
    update.defaultCurrency = defaultCurrency;
  }

  const settings = await WorkspaceSettings.findOneAndUpdate(
    { ownerId: session.user.id },
    { $set: update },
    { new: true, upsert: true },
  );

  return NextResponse.json(serialize(settings));
}