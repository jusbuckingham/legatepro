import { Schema, model, models } from "mongoose";

const TimeEntrySchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    // Description of the work performed for the estate
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Hours worked for this entry
    hours: {
      type: Number,
      required: true,
      min: 0,
    },

    // Hourly rate applicable at the time (snapshot)
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },

    // Optional category for grouping (court, travel, admin, property, etc.)
    category: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const TimeEntry =
  models.TimeEntry || model("TimeEntry", TimeEntrySchema);