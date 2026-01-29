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
  ownerId: Schema.Types.ObjectId;
  estateId: Schema.Types.ObjectId;

  date: Date;
  minutes: number;

  description?: string | null; // Optional short summary
  notes?: string | null; // Optional long-form notes

  activityType: TimeEntryActivityType;

  hourlyRate?: number | null;
  billable: boolean;
  invoiced: boolean;

  createdAt: Date;
  updatedAt: Date;
};

export type TimeEntryDocument = Document & TimeEntryRecord;

export type TimeEntrySerialized = Omit<TimeEntryRecord, "ownerId" | "estateId"> & {
  id: string;
  ownerId: string;
  estateId: string;
};

type PlainObject = Record<string, unknown>;

type ObjectIdLike = { toString: () => string };

function toStringId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value && typeof (value as ObjectIdLike).toString === "function") {
    return (value as ObjectIdLike).toString();
  }
  return undefined;
}

function normalizeTimeEntrySerialized(ret: unknown): TimeEntrySerialized {
  const obj = ret as PlainObject;

  const id = toStringId(obj._id) ?? "";
  const ownerId = toStringId(obj.ownerId) ?? "";
  const estateId = toStringId(obj.estateId) ?? "";

  // Drop mongo internals
  delete obj._id;
  delete obj.__v;

  return {
    ...(obj as Omit<TimeEntrySerialized, "id" | "ownerId" | "estateId">),
    id,
    ownerId,
    estateId,
  };
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
      maxlength: 500,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    activityType: {
      type: String,
      enum: TIME_ENTRY_ACTIVITY_TYPES,
      required: true,
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
    minimize: false,
  }
);

// Common list queries
TimeEntrySchema.index({ estateId: 1, date: -1, createdAt: -1 });
TimeEntrySchema.index({ ownerId: 1, estateId: 1, date: -1 });
// Billing filters
TimeEntrySchema.index({ estateId: 1, billable: 1, invoiced: 1, date: -1 });
TimeEntrySchema.index({ ownerId: 1, billable: 1, invoiced: 1, date: -1 });

TimeEntrySchema.virtual("hours").get(function (this: TimeEntryDocument) {
  if (typeof this.minutes !== "number" || Number.isNaN(this.minutes)) return 0;
  return Math.round((this.minutes / 60) * 100) / 100;
});

// Consistent serialization
TimeEntrySchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => normalizeTimeEntrySerialized(ret),
});

TimeEntrySchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => normalizeTimeEntrySerialized(ret),
});

export const TimeEntry: Model<TimeEntryDocument> =
  (models.TimeEntry as Model<TimeEntryDocument>) ||
  model<TimeEntryDocument>("TimeEntry", TimeEntrySchema);