// src/models/UtilityAccount.ts
import mongoose, { Schema, type Document, type Model, Types } from "mongoose";

export type UtilityType =
  | "electric"
  | "gas"
  | "water"
  | "sewer"
  | "trash"
  | "internet"
  | "cable"
  | "security"
  | "other";

export interface IUtilityAccount {
  ownerId: string; // user who owns this utility record
  estateId: Types.ObjectId; // tie to specific estate
  propertyId?: Types.ObjectId | null; // optional property-level link, nullable

  providerName: string; // e.g. DTE, Consumers, Comcast
  utilityType: UtilityType;

  accountNumber?: string | null;
  phone?: string | null;
  website?: string | null;

  // Balances & billing
  balanceDue?: number; // cents or dollars depending on app convention
  lastPaymentAmount?: number | null;
  lastPaymentDate?: Date | null;

  // Notes field for miscellaneous tracking
  notes?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface UtilityAccountDocument
  extends IUtilityAccount,
    Document {}

const UtilityAccountSchema = new Schema<UtilityAccountDocument>(
  {
    ownerId: { type: String, required: true, trim: true, index: true },

    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },

    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "EstateProperty",
      required: false,
      default: null,
      index: true,
    },

    providerName: { type: String, required: true, trim: true, maxlength: 160 },

    utilityType: {
      type: String,
      enum: [
        "electric",
        "gas",
        "water",
        "sewer",
        "trash",
        "internet",
        "cable",
        "security",
        "other",
      ],
      required: true,
    },

    accountNumber: { type: String, trim: true, maxlength: 80, default: null },
    phone: { type: String, trim: true, maxlength: 25, default: null },
    website: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
      validate: {
        validator: (v: string) => !v || /^https?:\/\//i.test(v),
        message: "Website must start with http:// or https://",
      },
    },

    balanceDue: { type: Number, default: 0, min: 0 },
    lastPaymentAmount: { type: Number, default: null, min: 0 },
    lastPaymentDate: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 4000, default: null },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

// Indexes for common queries
UtilityAccountSchema.index({ estateId: 1, createdAt: -1 });
UtilityAccountSchema.index({ ownerId: 1, createdAt: -1 });
UtilityAccountSchema.index({ estateId: 1, propertyId: 1, createdAt: -1 });

function withId(ret: unknown): Record<string, unknown> {
  const obj = (ret ?? {}) as Record<string, unknown>;
  const _id = obj._id;

  // Return a plain object with a stable string `id` field.
  return {
    ...obj,
    id: _id != null ? String(_id) : undefined,
  };
}

function stripInternalFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  // `Record<string, unknown>` makes these optional, so `delete` is type-safe.
  delete out._id;
  delete out.__v;
  return out;
}

UtilityAccountSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: unknown, ret: unknown) => {
    const obj = withId(ret);
    return stripInternalFields(obj);
  },
});

UtilityAccountSchema.set("toObject", {
  virtuals: true,
  transform: (_doc: unknown, ret: unknown) => {
    const obj = withId(ret);
    return stripInternalFields(obj);
  },
});

let UtilityAccountModel: Model<UtilityAccountDocument>;

try {
  UtilityAccountModel = mongoose.model<UtilityAccountDocument>(
    "UtilityAccount"
  );
} catch {
  UtilityAccountModel = mongoose.model<UtilityAccountDocument>(
    "UtilityAccount",
    UtilityAccountSchema
  );
}

export const UtilityAccount = UtilityAccountModel;
