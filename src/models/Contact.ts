

// src/models/Contact.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type ContactCategory =
  | "ATTORNEY"
  | "COURT"
  | "ACCOUNTANT"
  | "REAL_ESTATE"
  | "CONTRACTOR"
  | "UTILITY"
  | "TENANT"
  | "FAMILY"
  | "OTHER";

export interface IContact {
  ownerId: Types.ObjectId | string; // user who owns this record
  estateId?: Types.ObjectId | string; // optional: tie contact to a specific estate
  category?: ContactCategory;

  name: string; // person or primary contact name
  organization?: string; // firm, company, or entity
  roleOrRelationship?: string; // e.g. "Probate attorney", "Sibling", "Tenant"

  phone?: string;
  email?: string;

  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;

  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ContactDocument extends IContact, Document {}

const ContactSchema: Schema<ContactDocument> = new Schema<ContactDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    estateId: { type: Schema.Types.ObjectId, ref: "Estate", required: false, index: true },

    category: {
      type: String,
      enum: [
        "ATTORNEY",
        "COURT",
        "ACCOUNTANT",
        "REAL_ESTATE",
        "CONTRACTOR",
        "UTILITY",
        "TENANT",
        "FAMILY",
        "OTHER",
      ],
      required: false,
    },

    name: { type: String, required: true, trim: true },
    organization: { type: String, required: false, trim: true },
    roleOrRelationship: { type: String, required: false, trim: true },

    phone: { type: String, required: false, trim: true },
    email: { type: String, required: false, trim: true, lowercase: true },

    addressLine1: { type: String, required: false, trim: true },
    addressLine2: { type: String, required: false, trim: true },
    city: { type: String, required: false, trim: true },
    state: { type: String, required: false, trim: true },
    postalCode: { type: String, required: false, trim: true },

    notes: { type: String, required: false, trim: true },
  },
  {
    timestamps: true,
  }
);

let ContactModel: Model<ContactDocument>;

try {
  ContactModel = mongoose.model<ContactDocument>("Contact");
} catch {
  ContactModel = mongoose.model<ContactDocument>("Contact", ContactSchema);
}

export const Contact = ContactModel;