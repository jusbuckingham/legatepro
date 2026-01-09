import mongoose, { Schema, model } from "mongoose";
import type { Model } from "mongoose";

function transformEstatePropertyRet(ret: Record<string, unknown>) {
  const out = { ...ret } as Record<string, unknown> & { _id?: unknown; __v?: unknown };

  if (out._id != null) {
    out.id = String(out._id);
  }

  delete out._id;
  delete out.__v;

  return out;
}

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
    toJSON: {
      transform(_doc, ret) {
        return transformEstatePropertyRet(ret);
      },
    },
    toObject: {
      transform(_doc, ret) {
        return transformEstatePropertyRet(ret);
      },
    },
  }
);

EstatePropertySchema.index({ estateId: 1 });
EstatePropertySchema.index({ estateId: 1, isSold: 1 });
EstatePropertySchema.index({ estateId: 1, isRented: 1 });

type EstatePropertyModel = Model<unknown>;
type EstatePropertyModels = {
  EstateProperty?: EstatePropertyModel;
};

const models = mongoose.models as unknown as EstatePropertyModels;

export const EstateProperty =
  models.EstateProperty ?? model("EstateProperty", EstatePropertySchema);