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
  propertyId?: Types.ObjectId; // optional property-level link

  providerName: string; // e.g. DTE, Consumers, Comcast
  utilityType: UtilityType;

  accountNumber?: string | null;
  phone?: string | null;
  website?: string | null;

  // Balances & billing
  balanceDue?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: Date;

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
    ownerId: { type: String, required: true, index: true },

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
    },

    providerName: { type: String, required: true, trim: true },

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

    accountNumber: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    website: { type: String, trim: true, default: null },

    balanceDue: { type: Number, default: 0 },
    lastPaymentAmount: { type: Number },
    lastPaymentDate: { type: Date },

    notes: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
UtilityAccountSchema.index({ estateId: 1, createdAt: -1 });
UtilityAccountSchema.index({ ownerId: 1, createdAt: -1 });
UtilityAccountSchema.index({ estateId: 1, propertyId: 1, createdAt: -1 });

function withId(ret: unknown): Record<string, unknown> {
  const obj = (ret ?? {}) as Record<string, unknown>;
  const _id = obj._id;
  return {
    ...obj,
    id: _id != null ? String(_id) : undefined,
  };
}

UtilityAccountSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const obj = withId(ret);
    // Explicitly discard internal fields (avoid eslint unused warnings)
    const { _id, __v, ...rest } = obj;
    void _id;
    void __v;
    return rest;
  },
});

UtilityAccountSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => {
    const obj = withId(ret);
    const { _id, __v, ...rest } = obj;
    void _id;
    void __v;
    return rest;
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
