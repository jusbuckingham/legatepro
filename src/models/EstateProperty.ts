import { Schema, model, models } from "mongoose";

const EstatePropertySchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
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
    },
    postalCode: {
      type: String,
      trim: true,
    },

    // Basic characteristics
    propertyType: {
      type: String,
      enum: ["SFR", "MULTI", "CONDO", "LAND", "OTHER"],
      default: "SFR",
    },
    bedrooms: {
      type: Number,
    },
    bathrooms: {
      type: Number,
    },
    squareFeet: {
      type: Number,
    },

    // Financials
    estimatedValue: {
      type: Number,
    },
    monthlyRentTarget: {
      type: Number,
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
    },
  },
  {
    timestamps: true,
  }
);

export const EstateProperty =
  models.EstateProperty || model("EstateProperty", EstatePropertySchema);