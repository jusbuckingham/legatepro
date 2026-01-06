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
      enum: [
        "single_family",
        "multi_family",
        "condo",
        "land",
        "other"
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
        const { _id, __v: _v, ...rest } = ret as unknown as {
          _id?: unknown;
          __v?: unknown;
          [key: string]: unknown;
        };

        void _v;

        return {
          ...rest,
          id: _id ? String(_id) : undefined,
        };
      },
    },
    toObject: {
      transform(_doc, ret) {
        const { _id, __v: _v, ...rest } = ret as unknown as {
          _id?: unknown;
          __v?: unknown;
          [key: string]: unknown;
        };

        void _v;

        return {
          ...rest,
          id: _id ? String(_id) : undefined,
        };
      },
    },
  }
);

EstatePropertySchema.index({ estateId: 1 });
EstatePropertySchema.index({ estateId: 1, isSold: 1 });
EstatePropertySchema.index({ estateId: 1, isRented: 1 });

export const EstateProperty =
  models.EstateProperty || model("EstateProperty", EstatePropertySchema);