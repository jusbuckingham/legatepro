import mongoose, { Schema, type Document, type Model, type HydratedDocument } from "mongoose";

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

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

export type EstateTaskHydratedDocument = HydratedDocument<EstateTaskDocument>;

type TransformRet = Record<string, unknown> & { _id?: unknown; __v?: unknown };

function transformDoc(_doc: EstateTaskHydratedDocument, ret: TransformRet) {
  const { __v: _v, _id, ...rest } = ret;
  void _v;

  return {
    ...rest,
    id: _id != null ? String(_id) : "",
  };
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
    toJSON: {
      virtuals: true,
      transform: transformDoc,
    },
    toObject: {
      virtuals: true,
      transform: transformDoc,
    },
  },
);

// Common access patterns:
// - Timeline/paging: estateId + createdAt
// - Task lists: estateId + status
// - Due soon: estateId + dueDate
EstateTaskSchema.index({ estateId: 1, createdAt: -1 });
EstateTaskSchema.index({ estateId: 1, status: 1, createdAt: -1 });
EstateTaskSchema.index({ estateId: 1, dueDate: 1, createdAt: -1 });

export const EstateTask: Model<EstateTaskDocument> =
  mongoose.models.EstateTask ||
  mongoose.model<EstateTaskDocument>("EstateTask", EstateTaskSchema);

export default EstateTask;