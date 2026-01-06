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
  ownerId: Types.ObjectId | string; // user who owns this record
  estateId: Types.ObjectId | string; // required

  subject: EstateDocumentSubject;
  label: string; // human-friendly description

  location?: string; // e.g. "Google Drive", "iCloud", "Physical safe"
  url?: string; // digital link

  tags: string[];
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

function normalizeTags(input: unknown): string[] {
  if (!input) return [];

  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(",")
    : [];

  const cleaned = raw
    .map((t) => (typeof t === "string" ? t : ""))
    .map((t) => t.trim().toLowerCase())
    .map((t) => t.replace(/\s+/g, " "))
    .filter((t) => t.length > 0);

  // De-dupe while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const t of cleaned) {
    if (seen.has(t)) continue;
    seen.add(t);
    deduped.push(t);
  }

  // Guardrail: avoid unbounded arrays
  return deduped.slice(0, 20);
}

export function normalizeEstateDocumentTags(input: unknown): string[] {
  return normalizeTags(input);
}

function normalizeSubject(input: unknown): EstateDocumentSubject {
  if (typeof input !== "string") return "OTHER";
  const value = input.trim().toUpperCase();

  const allowed: EstateDocumentSubject[] = [
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
  ];

  return (allowed as string[]).includes(value) ? (value as EstateDocumentSubject) : "OTHER";
}

const EstateDocumentSchema = new Schema<EstateDocumentDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

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
      default: "OTHER",
      set: (v: unknown) => normalizeSubject(v),
    },

    label: { type: String, required: true, trim: true, maxlength: 200 },

    location: { type: String, trim: true, maxlength: 200 },
    url: { type: String, trim: true, maxlength: 2000 },

    tags: {
      type: [String],
      default: [],
      set: (v: unknown) => normalizeTags(v),
      index: true,
    },

    notes: { type: String, trim: true, maxlength: 5000 },

    isSensitive: { type: Boolean, default: false },

    // Upload metadata
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true },
    fileSizeBytes: { type: Number, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = String(r._id ?? "");
        delete r._id;
        delete r.__v;
        return r;
      },
    },
    toObject: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = String(r._id ?? "");
        delete r._id;
        delete r.__v;
        return r;
      },
    },
  }
);

// Helpful compound indexes for common query patterns
EstateDocumentSchema.index({ estateId: 1, createdAt: -1 });
EstateDocumentSchema.index({ estateId: 1, subject: 1, createdAt: -1 });
EstateDocumentSchema.index({ estateId: 1, isSensitive: 1, createdAt: -1 });
EstateDocumentSchema.index({ estateId: 1, tags: 1 });
EstateDocumentSchema.index({ estateId: 1, subject: 1, tags: 1, createdAt: -1 });

EstateDocumentSchema.index(
  { label: "text", notes: "text", location: "text", url: "text", tags: "text", fileName: "text" },
  {
    name: "estate_document_text",
    weights: {
      label: 5,
      tags: 4,
      notes: 2,
      location: 2,
      url: 1,
      fileName: 1,
    },
  }
);

EstateDocumentSchema.index(
  { estateId: 1, createdAt: -1 },
  { partialFilterExpression: { isSensitive: false }, name: "estate_docs_public_created" }
);

EstateDocumentSchema.index({ estateId: 1, label: 1 });

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