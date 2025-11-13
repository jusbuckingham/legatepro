import { Schema, model, models } from "mongoose";

const EstateDocumentSchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },

    // High-level subject/category for the document
    // e.g. BANKING, AUTO, MEDICAL, INCOME_TAX, PROPERTY, INSURANCE, IDENTITY, OTHER
    subject: {
      type: String,
      required: true,
      trim: true,
    },

    // Where this document is stored in the real world
    // e.g. "Google Drive", "iCloud Drive", "Dropbox", "Physical file cabinet"
    location: {
      type: String,
      trim: true,
    },

    // Human-friendly label/description for the doc index
    // e.g. "Chase Checking 1234 Statements 2022–2023"
    label: {
      type: String,
      required: true,
      trim: true,
    },

    // Direct link/URL to the document (if digital)
    url: {
      type: String,
      trim: true,
    },

    // Optional tags for filtering/search (e.g. ["Banking", "Chase", "Statements"])
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    // Any extra notes the personal representative wants to remember
    notes: {
      type: String,
      trim: true,
    },

    // Whether this document contains especially sensitive info
    isSensitive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const EstateDocument =
  models.EstateDocument || model("EstateDocument", EstateDocumentSchema);