import { Schema, model, models, type Model, type Document } from "mongoose";

export const TIME_ENTRY_ACTIVITY_TYPES = [
  "GENERAL",
  "COURT",
  "ATTORNEY_COMMUNICATION",
  "BENEFICIARY_COMMUNICATION",
  "CREDITOR_COMMUNICATION",
  "PROPERTY_VISIT",
  "ACCOUNTING",
  "DOCUMENT_PREP",
  "TRAVEL",
  "OTHER",
] as const;

export type TimeEntryActivityType = (typeof TIME_ENTRY_ACTIVITY_TYPES)[number];

export interface TimeEntryAttrs {
  ownerId: Schema.Types.ObjectId | string;
  estateId: Schema.Types.ObjectId | string;

  date: Date;
  minutes: number; // store minutes for easy math

  description?: string;
  activityType: TimeEntryActivityType;

  // Optional billing-related fields
  hourlyRate?: number; // dollars per hour
  billable?: boolean;
  invoiced?: boolean;
}

export interface TimeEntryDocument extends Document, TimeEntryAttrs {
  createdAt: Date;
  updatedAt: Date;
}

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

export const TimeEntry: Model<TimeEntryDocument> =
  (models.TimeEntry as Model<TimeEntryDocument>) ||
  model<TimeEntryDocument>("TimeEntry", TimeEntrySchema);