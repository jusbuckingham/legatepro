import { Schema, model, models } from "mongoose";

const DecedentSchema = new Schema(
  {
    fullName: { type: String, required: true },
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

const CompensationSchema = new Schema(
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

const EstateSchema = new Schema(
  {
    ownerId: { type: String, required: true }, // for now, user id as string; later tie to auth
    label: { type: String, required: true },   // "Estate of Donald Buckingham"

    decedent: { type: DecedentSchema, required: true },
    compensation: { type: CompensationSchema, default: {} },

    courtCounty: { type: String },
    courtCaseNumber: { type: String },
    courtState: { type: String },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
  },
  { timestamps: true }
);

export const Estate = models.Estate || model("Estate", EstateSchema);