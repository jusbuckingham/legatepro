import mongoose, { Schema, Document } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

export interface EstatePropertyDocument extends Document {
  estateId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  label: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType: "single_family" | "multi_family" | "condo" | "land" | "other";
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  estimatedValue?: number;
  monthlyRentTarget?: number;
  isRented: boolean;
  isSold: boolean;
  notes?: string | null;
  estateSnapshot?: { displayName?: string; caseNumber?: string } | null; // denormalized helper
  createdAt: Date;
  updatedAt: Date;
}

const EstatePropertySchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },

    // Owner reference (optional)
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // Display name, e.g. "Dickerson house" or "Tuller two-family"
    label: {
      type: String,
      required: true,
      trim: true,
    },

    // Address fields
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
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },
    postalCode: {
      type: String,
      trim: true,
      maxlength: 12,
    },

    // Basic characteristics
    propertyType: {
      type: String,
      enum: [
        "single_family",
        "multi_family",
        "condo",
        "land",
        "other",
      ],
      default: "single_family",
    },
    bedrooms: {
      type: Number,
      min: 0,
    },
    bathrooms: {
      type: Number,
      min: 0,
    },
    squareFeet: {
      type: Number,
      min: 0,
    },

    // Financials
    estimatedValue: {
      type: Number,
      min: 0,
    },
    monthlyRentTarget: {
      type: Number,
      min: 0,
    },

    // Status flags
    isRented: {
      type: Boolean,
      default: false,
    },
    isSold: {
      type: Boolean,
      default: false,
    },

    // Notes (e.g. tenant info, repair notes, realtor info)
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Denormalized helper for quick reference
    estateSnapshot: {
      displayName: { type: String, trim: true },
      caseNumber: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform(_doc, ret) {
        return serializeMongoDoc(ret);
      },
    },
    toObject: {
      transform(_doc, ret) {
        return serializeMongoDoc(ret);
      },
    },
  }
);

EstatePropertySchema.index({ estateId: 1 });
EstatePropertySchema.index({ estateId: 1, isSold: 1 });
EstatePropertySchema.index({ estateId: 1, isRented: 1 });

// Common estate dashboard queries
EstatePropertySchema.index({ estateId: 1, createdAt: -1 });

// Status-based filters
EstatePropertySchema.index({ estateId: 1, isSold: 1, isRented: 1 });

export const EstateProperty =
  (mongoose.models.EstateProperty as mongoose.Model<EstatePropertyDocument> | undefined) ??
  mongoose.model<EstatePropertyDocument>("EstateProperty", EstatePropertySchema);