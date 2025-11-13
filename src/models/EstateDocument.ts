import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type EstateDocumentSubject =
  | "BANKING"
  | "AUTO"
  | "MEDICAL"
  | "INCOME_TAX"
  | "PROPERTY"
  | "INSURANCE"
  | "IDENTITY"
  | "LEGAL"
  | "ESTATE_ACCOUNTING"
  | "RECEIPTS"
  | "OTHER";

export interface IEstateDocument {
  ownerId: string; // user who owns this record
  estateId: Types.ObjectId; // required

  subject: EstateDocumentSubject;
  label: string; // human‑friendly description

  location?: string; // e.g. "Google Drive", "iCloud", "Physical safe"
  url?: string; // digital link

  tags?: string[];
  notes?: string;

  isSensitive?: boolean;

  // Optional metadata if uploaded through LegatePro
  fileName?: string;
  fileType?: string;
  fileSizeBytes?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface EstateDocumentDocument
  extends IEstateDocument,
    Document {}

const EstateDocumentSchema = new Schema<EstateDocumentDocument>(
  {
    ownerId: { type: String, required: true, index: true },

    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      enum: [
        "BANKING",
        "AUTO",
        "MEDICAL",
        "INCOME_TAX",
        "PROPERTY",
        "INSURANCE",
        "IDENTITY",
        "LEGAL",
        "ESTATE_ACCOUNTING",
        "RECEIPTS",
        "OTHER",
      ],
      trim: true,
    },

    label: { type: String, required: true, trim: true },

    location: { type: String, trim: true },
    url: { type: String, trim: true },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    notes: { type: String, trim: true },

    isSensitive: { type: Boolean, default: false },

    // Upload metadata
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true },
    fileSizeBytes: { type: Number },
  },
  {
    timestamps: true,
  }
);

let EstateDocumentModel: Model<EstateDocumentDocument>;

try {
  EstateDocumentModel = mongoose.model<EstateDocumentDocument>(
    "EstateDocument"
  );
} catch {
  EstateDocumentModel = mongoose.model<EstateDocumentDocument>(
    "EstateDocument",
    EstateDocumentSchema
  );
}

export const EstateDocument = EstateDocumentModel;