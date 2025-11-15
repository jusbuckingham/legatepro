import {
  Schema,
  model,
  models,
  InferSchemaType,
  HydratedDocument,
  Model,
  Types,
} from "mongoose";

/**
 * TimeEntry Schema
 * Tracks billable/non‑billable hours for an estate.
 */

const TimeEntrySchema = new Schema(
  {
    estateId: {
      type: Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    hours: {
      type: Number,
      required: true,
      min: 0,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    isBillable: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ---- Export Types ----
export type TimeEntrySchemaType = InferSchemaType<typeof TimeEntrySchema>;
export type TimeEntryDocument = HydratedDocument<TimeEntrySchemaType>;

// Typed model type
export type TimeEntryModelType = Model<TimeEntrySchemaType>;

// ---- Export Model ----
export const TimeEntry =
  (models.TimeEntry as TimeEntryModelType) ||
  model<TimeEntrySchemaType>("TimeEntry", TimeEntrySchema);