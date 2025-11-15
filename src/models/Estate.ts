// src/models/Estate.ts
import mongoose, { Schema, Document, Model } from "mongoose";

// Detailed decedent info (optional, but keeps room for your richer spreadsheet data)
interface DecedentDetails {
  fullName?: string;
  dateOfBirth?: Date;
  dateOfDeath?: Date;
  ssnLast4?: string;
  primaryAddress?: string;
  altAddress?: string;
  driversLicenseNumber?: string;
  phoneNumber?: string;
  chaseCheckingLast4?: string;
  estateAccountNumberLast4?: string;
  estateRoutingNumber?: string;
  estateWireNumberLast4?: string;
  encryptedDataBlob?: string;
}

// Personal representative compensation settings
interface CompensationSettings {
  feeType?: "HOURLY" | "PERCENTAGE" | "FLAT";
  hourlyRate?: number;
  percentageRate?: number;
  flatAmount?: number;
}

export interface IEstate {
  ownerId: string; // user who owns this estate workspace

  // Top-level names used throughout the UI & API
  decedentName?: string; // e.g. "Donald Buckingham"
  name?: string; // optional label, e.g. "Estate of Donald Buckingham"

  // Optional richer decedent block for more advanced flows
  decedent?: DecedentDetails;

  // Court info
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;

  // Personal representative compensation config
  compensation?: CompensationSettings;

  status?: "OPEN" | "CLOSED" | "open" | "closed";

  createdAt?: Date;
  updatedAt?: Date;
}

export interface EstateDocument extends IEstate, Document {}

const DecedentSchema = new Schema<DecedentDetails>(
  {
    fullName: { type: String },
    dateOfBirth: { type: Date },
    dateOfDeath: { type: Date },
    ssnLast4: { type: String },
    primaryAddress: { type: String },
    altAddress: { type: String },
    driversLicenseNumber: { type: String },
    phoneNumber: { type: String },
    chaseCheckingLast4: { type: String },
    estateAccountNumberLast4: { type: String },
    estateRoutingNumber: { type: String },
    estateWireNumberLast4: { type: String },
    encryptedDataBlob: { type: String },
  },
  { _id: false }
);

const CompensationSchema = new Schema<CompensationSettings>(
  {
    feeType: {
      type: String,
      enum: ["HOURLY", "PERCENTAGE", "FLAT"],
      default: "HOURLY",
    },
    hourlyRate: { type: Number, default: 0 },
    percentageRate: { type: Number },
    flatAmount: { type: Number },
  },
  { _id: false }
);

const EstateSchema = new Schema<EstateDocument>(
  {
    ownerId: { type: String, required: true, index: true },

    // Primary names used in the UI & filters
    decedentName: { type: String, required: false, trim: true },
    name: { type: String, required: false, trim: true },

    decedent: { type: DecedentSchema, required: false },

    courtCounty: { type: String, required: false, trim: true, index: true },
    courtState: { type: String, required: false, trim: true, index: true },
    caseNumber: { type: String, required: false, trim: true, index: true },

    compensation: { type: CompensationSchema, required: false, default: {} },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      set: (val: string) => (typeof val === "string" ? val.toUpperCase() : val),
    },
  },
  {
    timestamps: true,
  }
);

let EstateModel: Model<EstateDocument>;

try {
  EstateModel = mongoose.model<EstateDocument>("Estate");
} catch {
  EstateModel = mongoose.model<EstateDocument>("Estate", EstateSchema);
}

export const Estate = EstateModel;