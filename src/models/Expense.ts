import { Schema, model, models } from "mongoose";

const ExpenseSchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },

    // Core fields
    date: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      enum: ["FUNERAL", "PROBATE", "PROPERTY", "UTILITIES", "TAXES", "OTHER"],
      default: "OTHER",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Who was paid
    payee: {
      type: String,
      trim: true,
    },

    // Optional notes (e.g. "paid by estate account", "reimbursable", "related to Tuller")
    notes: {
      type: String,
      trim: true,
    },

    // Status
    isPaid: {
      type: Boolean,
      default: true,
    },

    // Optional relational hooks for later (properties, utilities, docs, etc.)
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "EstateProperty",
    },
    utilityAccountId: {
      type: Schema.Types.ObjectId,
      ref: "UtilityAccount",
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "EstateDocument",
    },
  },
  {
    timestamps: true,
  },
);

export const Expense = models.Expense || model("Expense", ExpenseSchema);
