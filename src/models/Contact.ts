import { Schema, model, models, type Document, type Types } from "mongoose";

export type ContactRole =
  | "HEIR"
  | "BENEFICIARY"
  | "ATTORNEY"
  | "ACCOUNTANT"
  | "EXECUTOR"
  | "OTHER";

export interface ContactDocument extends Document {
  ownerId: Types.ObjectId | string;
  estateId: Types.ObjectId | string;
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
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
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
        "HEIR",
        "BENEFICIARY",
        "ATTORNEY",
        "ACCOUNTANT",
        "EXECUTOR",
        "OTHER",
      ],
      default: "OTHER",
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

export const Contact =
  models.Contact || model<ContactDocument>("Contact", ContactSchema);