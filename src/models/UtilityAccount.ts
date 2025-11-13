// src/models/UtilityAccount.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type UtilityType =
  | "ELECTRIC"
  | "GAS"
  | "WATER"
  | "SEWER"
  | "TRASH"
  | "INTERNET"
  | "CABLE"
  | "SECURITY"
  | "OTHER";

export interface IUtilityAccount {
  ownerId: string; // user who owns this utility record
  estateId: Types.ObjectId; // tie to specific estate
  propertyId?: Types.ObjectId; // optional property-level link

  providerName: string; // e.g. DTE, Consumers, Comcast
  utilityType: UtilityType;

  accountNumber?: string;
  phone?: string;
  website?: string;

  // Balances & billing
  balanceDue?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: Date;

  // Notes field for miscellaneous tracking
  notes?: string;

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
        "ELECTRIC",
        "GAS",
        "WATER",
        "SEWER",
        "TRASH",
        "INTERNET",
        "CABLE",
        "SECURITY",
        "OTHER",
      ],
      required: true,
    },

    accountNumber: { type: String, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },

    balanceDue: { type: Number, default: 0 },
    lastPaymentAmount: { type: Number },
    lastPaymentDate: { type: Date },

    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

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
