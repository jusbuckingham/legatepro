import { Schema, model, models, type Document, type Types } from "mongoose";

export type ContactRole =
  | "EXECUTOR"
  | "ADMINISTRATOR"
  | "HEIR"
  | "BENEFICIARY"
  | "ATTORNEY"
  | "ACCOUNTANT"
  | "CREDITOR"
  | "VENDOR"
  | "OTHER";

export interface ContactDocument extends Document {
  ownerId: Types.ObjectId | string;
  // Legacy: single-estate linkage
  estateId?: Types.ObjectId | string;

  // Current: contact can be linked to multiple estates
  estates?: Array<Types.ObjectId | string>;
  name: string;
  relationship?: string;
  role?: ContactRole;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  isPrimary?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<ContactDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Legacy: single-estate linkage (kept for backward compatibility)
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: false,
      index: true,
    },

    // Current: contact can be linked to multiple estates
    estates: {
      type: [Schema.Types.ObjectId],
      ref: "Estate",
      default: [],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    relationship: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: [
        "EXECUTOR",
        "ADMINISTRATOR",
        "HEIR",
        "BENEFICIARY",
        "ATTORNEY",
        "ACCOUNTANT",
        "CREDITOR",
        "VENDOR",
        "OTHER",
      ],
      default: "OTHER",
      required: true,
    },
    email: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    addressLine1: {
      type: String,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    postalCode: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Query helpers
// Common access patterns:
// - list contacts for an estate (newest first)
// - list contacts owned by a user, optionally filtered by estate
// Estate-scoped listings (legacy + current)
ContactSchema.index({ estateId: 1, createdAt: -1 });
ContactSchema.index({ estates: 1, createdAt: -1 });

// Owner listings (optionally filtered by estate)
ContactSchema.index({ ownerId: 1, createdAt: -1 });
ContactSchema.index({ ownerId: 1, estateId: 1, createdAt: -1 });
ContactSchema.index({ ownerId: 1, estates: 1, createdAt: -1 });

export const Contact =
  models.Contact || model<ContactDocument>("Contact", ContactSchema);