import {
  Schema,
  model,
  models,
  type Document,
  type Model,
} from "mongoose";

function serializeWorkspaceSettings(
  _doc: unknown,
  ret: {
    _id?: unknown;
    __v?: unknown;
    [key: string]: unknown;
  },
) {
  return {
    ...ret,
    id: ret._id ? String(ret._id) : undefined,
  };
}

export type InvoiceTermsCode =
  | "DUE_ON_RECEIPT"
  | "NET_15"
  | "NET_30"
  | "NET_45"
  | "NET_60";

export type InvoiceNumberResetPolicy = "NEVER" | "YEARLY";

export interface WorkspaceSettingsAttrs {
  ownerId: string;

  // Branding
  firmName?: string | null;
  firmAddressLine1?: string | null;
  firmAddressLine2?: string | null;
  firmCity?: string | null;
  firmState?: string | null;
  firmPostalCode?: string | null;
  firmCountry?: string | null;
  logoUrl?: string | null;

  // Billing defaults
  defaultHourlyRateCents?: number | null;
  defaultInvoiceTerms?: InvoiceTermsCode;
  defaultCurrency?: string | null;

  // Invoice numbering configuration
  invoiceNumberPrefix?: string | null;
  invoiceNumberSequence?: number | null;
  invoiceNumberFormat?: string | null;
  /**
   * How the invoice number sequence should reset over time.
   * - NEVER: single global sequence for the workspace
   * - YEARLY: sequence resets each calendar year
   */
  invoiceNumberResetPolicy?: InvoiceNumberResetPolicy;
  /**
   * Minimum number of digits to left-pad the numeric portion of the invoice number.
   * e.g. padding 4 => INV-0001, INV-0002, etc.
   */
  invoiceNumberPadding?: number | null;

  // Billing / subscription plumbing (kept flexible)
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;

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
    firmName: { type: String, default: null },
    firmAddressLine1: { type: String, default: null },
    firmAddressLine2: { type: String, default: null },
    firmCity: { type: String, default: null },
    firmState: { type: String, default: null },
    firmPostalCode: { type: String, default: null },
    firmCountry: { type: String, default: null },
    logoUrl: { type: String, default: null },

    // Billing defaults
    defaultHourlyRateCents: { type: Number, default: null },
    defaultInvoiceTerms: {
      type: String,
      enum: ["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"],
      default: "NET_30",
    },
    defaultCurrency: {
      type: String,
      default: null,
    },

    // Invoice numbering configuration
    invoiceNumberPrefix: {
      type: String,
      default: null,
    },
    invoiceNumberSequence: {
      type: Number,
      default: null,
    },
    invoiceNumberFormat: {
      type: String,
      default: "{PREFIX}{SEQ}",
    },
    invoiceNumberResetPolicy: {
      type: String,
      enum: ["NEVER", "YEARLY"],
      default: "NEVER",
    },
    invoiceNumberPadding: {
      type: Number,
      default: null,
    },

    // Billing / subscription plumbing
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    subscriptionStatus: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: serializeWorkspaceSettings,
    },
    toObject: {
      transform: serializeWorkspaceSettings,
    },
  },
);

WorkspaceSettingsSchema.index({ ownerId: 1, createdAt: -1 });

export const WorkspaceSettings: WorkspaceSettingsModel =
  (models.WorkspaceSettings as WorkspaceSettingsModel) ??
  model<WorkspaceSettingsDocument, WorkspaceSettingsModel>(
    "WorkspaceSettings",
    WorkspaceSettingsSchema,
  );
