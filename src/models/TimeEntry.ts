import { Schema, model, models, type Model, type Document } from "mongoose";

export const TIME_ENTRY_ACTIVITY_TYPES = [
  "GENERAL",
  "CALL",
  "EMAIL",
  "MEETING",
  "RESEARCH",
  "DRAFTING",
  "FILING",
  "COURT",
  "TRAVEL",
  "ADMIN",
] as const;

export type TimeEntryActivityType = (typeof TIME_ENTRY_ACTIVITY_TYPES)[number];

export type TimeEntryRecord = {
  ownerId: unknown;
  estateId: unknown;

  date: Date;
  minutes: number;

  description?: string | null;
  notes?: string | null;

  activityType: TimeEntryActivityType;

  hourlyRate?: number | null;
  billable: boolean;
  invoiced: boolean;

  createdAt: Date;
  updatedAt: Date;
};

export type TimeEntryDocument = Document & TimeEntryRecord;

type PlainObject = Record<string, unknown>;

function toPlainObject(ret: unknown): PlainObject {
  return ret as PlainObject;
}

function applyCommonTransforms(ret: unknown): PlainObject {
  const obj = toPlainObject(ret);

  // Provide a stable `id` field (string) and remove Mongo internals.
  const _id = obj._id;
  if (typeof _id === "string") obj.id = _id;
  else if (_id && typeof _id === "object" && "toString" in _id && typeof (_id as { toString: () => string }).toString === "function") {
    obj.id = (_id as { toString: () => string }).toString();
  }

  delete obj._id;
  delete obj.__v;

  return obj;
}

// Indexes (query patterns: estate timeline, owner scoped queries, billing views)
// NOTE: Mongoose will create these in dev; in production prefer migrations / ensureIndexes.
const TimeEntrySchema = new Schema<TimeEntryDocument>(
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

    date: {
      type: Date,
      required: true,
    },
    minutes: {
      type: Number,
      required: true,
      min: 1,
    },

    description: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },

    activityType: {
      type: String,
      enum: TIME_ENTRY_ACTIVITY_TYPES,
      default: "GENERAL",
    },

    hourlyRate: {
      type: Number,
      min: 0,
    },
    billable: {
      type: Boolean,
      default: true,
    },
    invoiced: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Common list queries
TimeEntrySchema.index({ estateId: 1, date: -1, createdAt: -1 });
TimeEntrySchema.index({ ownerId: 1, estateId: 1, date: -1 });
// Billing filters
TimeEntrySchema.index({ estateId: 1, billable: 1, invoiced: 1, date: -1 });

// Consistent serialization
TimeEntrySchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => applyCommonTransforms(ret),
});

TimeEntrySchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => applyCommonTransforms(ret),
});

export const TimeEntry: Model<TimeEntryDocument> =
  (models.TimeEntry as Model<TimeEntryDocument>) ||
  model<TimeEntryDocument>("TimeEntry", TimeEntrySchema);