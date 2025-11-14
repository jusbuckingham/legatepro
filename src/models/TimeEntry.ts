import { Schema, model, models } from "mongoose";

const TimeEntrySchema = new Schema(
  {
    estateId: {
      type: String,
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

export const TimeEntry =
  models.TimeEntry || model("TimeEntry", TimeEntrySchema);