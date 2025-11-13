import { Schema, model, models } from "mongoose";

const RentPaymentSchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "EstateProperty",
    },

    // Tenant / payer name
    tenantName: {
      type: String,
      trim: true,
      required: true,
    },

    // For which month/year this payment applies
    periodMonth: {
      type: Number, // 1-12
      required: true,
    },
    periodYear: {
      type: Number,
      required: true,
    },

    // Actual payment details
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    method: {
      type: String,
      trim: true, // e.g. "Cash", "Zelle", "Money order"
    },
    reference: {
      type: String,
      trim: true, // e.g. confirmation #
    },

    notes: {
      type: String,
      trim: true,
    },

    isLate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const RentPayment =
  models.RentPayment || model("RentPayment", RentPaymentSchema);