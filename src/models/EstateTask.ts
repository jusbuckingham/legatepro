import mongoose, { Schema, type Document, type Model, type HydratedDocument } from "mongoose";

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

export interface EstateTaskDocument extends Document {
  estateId: string;
  ownerId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: Date | null;
  completedAt?: Date | null;

  relatedDocumentId?: string | null;
  relatedInvoiceId?: string | null;

  priority?: "LOW" | "MEDIUM" | "HIGH" | null;
  archivedAt?: Date | null;

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
    estateId: { type: String, required: true, trim: true, index: true },
    ownerId: { type: String, required: true, trim: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, trim: true, maxlength: 4000, default: null },

    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "DONE"],
      default: "NOT_STARTED",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: null,
    },

    dueDate: { type: Date },
    completedAt: { type: Date },

    archivedAt: { type: Date, default: null },

    relatedDocumentId: { type: String },
    relatedInvoiceId: { type: String },
  },
  {
    timestamps: true,
    minimize: false,
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

// Owner-scoped task feeds
EstateTaskSchema.index({ ownerId: 1, status: 1, createdAt: -1 });

// Archived filtering
EstateTaskSchema.index({ estateId: 1, archivedAt: 1, createdAt: -1 });

export const EstateTask: Model<EstateTaskDocument> =
  mongoose.models.EstateTask ||
  mongoose.model<EstateTaskDocument>("EstateTask", EstateTaskSchema);

export default EstateTask;