// src/models/WorkspaceSettings.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface WorkspaceSettingsDocument extends Document {
  defaultHourlyRate: number | null;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSettingsSchema = new Schema<WorkspaceSettingsDocument>(
  {
    defaultHourlyRate: {
      type: Number,
      default: null,
    },
    notificationsEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const WorkspaceSettings: Model<WorkspaceSettingsDocument> =
  (mongoose.models.WorkspaceSettings as Model<WorkspaceSettingsDocument>) ||
  mongoose.model<WorkspaceSettingsDocument>(
    "WorkspaceSettings",
    WorkspaceSettingsSchema,
  );