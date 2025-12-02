import {
  Schema,
  model,
  models,
  type Document,
  type Model,
} from "mongoose";

export type InvoiceTermsCode =
  | "DUE_ON_RECEIPT"
  | "NET_15"
  | "NET_30"
  | "NET_45"
  | "NET_60";

export interface WorkspaceSettingsAttrs {
  ownerId: string;

  // Branding
  firmName?: string;
  firmAddressLine1?: string;
  firmAddressLine2?: string;
  firmCity?: string;
  firmState?: string;
  firmPostalCode?: string;
  firmCountry?: string;
  logoUrl?: string;

  // Billing defaults
  defaultHourlyRateCents?: number;
  defaultInvoiceTerms?: InvoiceTermsCode;
  defaultCurrency?: string;

  // Billing / subscription plumbing (kept flexible)
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkspaceSettingsDocument
  extends Document,
    WorkspaceSettingsAttrs {}

export type WorkspaceSettingsModel = Model<WorkspaceSettingsDocument>;

const WorkspaceSettingsSchema = new Schema<
  WorkspaceSettingsDocument,
  WorkspaceSettingsModel
>(
  {
    ownerId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },

    // Branding
    firmName: { type: String },
    firmAddressLine1: { type: String },
    firmAddressLine2: { type: String },
    firmCity: { type: String },
    firmState: { type: String },
    firmPostalCode: { type: String },
    firmCountry: { type: String },
    logoUrl: { type: String },

    // Billing defaults
    defaultHourlyRateCents: { type: Number },
    defaultInvoiceTerms: {
      type: String,
      enum: ["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"],
      default: "NET_30",
    },
    defaultCurrency: {
      type: String,
      default: "USD",
    },

    // Billing / subscription plumbing
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: { type: String },
  },
  {
    timestamps: true,
  },
);

export const WorkspaceSettings: WorkspaceSettingsModel =
  (models.WorkspaceSettings as WorkspaceSettingsModel) ??
  model<WorkspaceSettingsDocument, WorkspaceSettingsModel>(
    "WorkspaceSettings",
    WorkspaceSettingsSchema,
  );