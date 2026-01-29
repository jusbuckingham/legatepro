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
  const { _id, ...rest } = ret;
  return {
    ...rest,
    id: _id ? String(_id) : undefined,
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
      trim: true,
      index: true,
      unique: true,
    },

    // Branding
    firmName: { type: String, trim: true, maxlength: 160, default: null },
    firmAddressLine1: { type: String, trim: true, maxlength: 160, default: null },
    firmAddressLine2: { type: String, trim: true, maxlength: 160, default: null },
    firmCity: { type: String, trim: true, maxlength: 80, default: null },
    firmState: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: null,
    },
    firmPostalCode: { type: String, trim: true, maxlength: 20, default: null },
    firmCountry: { type: String, trim: true, maxlength: 80, default: null },
    logoUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
      validate: {
        validator: (v: string) => !v || /^https?:\/\//i.test(v),
        message: "logoUrl must start with http:// or https://",
      },
    },

    // Billing defaults
    defaultHourlyRateCents: { type: Number, default: null, min: 0 },
    defaultInvoiceTerms: {
      type: String,
      enum: ["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45", "NET_60"],
      default: "NET_30",
    },
    defaultCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: null,
    },

    // Invoice numbering configuration
    invoiceNumberPrefix: {
      type: String,
      trim: true,
      maxlength: 24,
      default: null,
    },
    invoiceNumberSequence: {
      type: Number,
      default: null,
      min: 0,
    },
    invoiceNumberFormat: {
      type: String,
      trim: true,
      maxlength: 80,
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
      min: 0,
      max: 12,
    },

    // Billing / subscription plumbing
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    subscriptionStatus: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false,
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
