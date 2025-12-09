import mongoose, { Schema, Document, Model } from "mongoose";

export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "DONE";

export interface EstateTaskDocument extends Document {
  estateId: string;
  ownerId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: Date | null;
  completedAt?: Date | null;

  relatedDocumentId?: string | null;
  relatedInvoiceId?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const EstateTaskSchema = new Schema<EstateTaskDocument>(
  {
    estateId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },

    title: { type: String, required: true },
    description: { type: String },

    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "DONE"],
      default: "NOT_STARTED",
    },

    dueDate: { type: Date },
    completedAt: { type: Date },

    relatedDocumentId: { type: String },
    relatedInvoiceId: { type: String },
  },
  {
    timestamps: true,
  },
);

export const EstateTask: Model<EstateTaskDocument> =
  mongoose.models.EstateTask ||
  mongoose.model<EstateTaskDocument>("EstateTask", EstateTaskSchema);

export default EstateTask;