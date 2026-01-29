// src/models/Task.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

/**
 * High-level state of a task.
 */
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

/**
 * How urgent/important the task is.
 */
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Shape of a Task document in MongoDB.
 */
export interface TaskDocument extends Document {
  // Ownership / relationships
  estateId: Types.ObjectId;
  ownerId: Types.ObjectId;

  // Core fields
  subject: string;
  description?: string | null;

  // Status / workflow
  status: TaskStatus;
  priority: TaskPriority;

  // Time + estimation
  dueDate?: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;

  // Misc
  notes?: string | null;

  // Timestamps (added by Mongoose)
  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  hours: number;
}

/**
 * Mongoose model type for Task.
 */
export type TaskModel = Model<TaskDocument>;

/**
 * Lean version of a Task document (what you typically use in the app layer).
 * We define this manually instead of using mongoose.LeanDocument.
 */
export type TaskDocLean = {
  _id: Types.ObjectId;
  id: string;
  estateId: Types.ObjectId;
  ownerId: Types.ObjectId;
  subject: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  hours: number;
};

const TaskSchema = new Schema<TaskDocument, TaskModel>(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: null,
    },

    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"],
      default: "OPEN",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },

    dueDate: {
      type: Date,
    },
    estimatedMinutes: {
      type: Number,
      min: 0,
    },
    actualMinutes: {
      type: Number,
      min: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

// Helpful indexes for querying "what do I need to do next?"
TaskSchema.index({ estateId: 1, status: 1, priority: 1, dueDate: 1 });
TaskSchema.index({ ownerId: 1, status: 1, dueDate: 1 });

// Owner-priority feed (dashboard ordering)
TaskSchema.index({ ownerId: 1, priority: 1, dueDate: 1, createdAt: -1 });

/**
 * Virtual: hours derived from actualMinutes.
 */
TaskSchema.virtual("hours").get(function (this: TaskDocument) {
  const mins =
    typeof this.actualMinutes === "number"
      ? this.actualMinutes
      : typeof this.estimatedMinutes === "number"
      ? this.estimatedMinutes
      : 0;
  return Number.isFinite(mins) ? mins / 60 : 0;
});

const toIdString = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v instanceof Types.ObjectId) return v.toString();
  if (v && typeof (v as { toString?: unknown }).toString === "function") {
    return String((v as { toString: () => string }).toString());
  }
  return "";
};

// Public/serialized shape used by API/UI layers.
export type TaskSerialized = Omit<TaskDocLean, "_id" | "estateId" | "ownerId"> & {
  id: string;
  estateId: string;
  ownerId: string;
};

function normalizeTaskSerialized(input: unknown): TaskSerialized {
  const raw = (input ?? {}) as Record<string, unknown>;
  const base = serializeMongoDoc(raw) as Record<string, unknown> & { id: string };

  const status = base.status;
  const priority = base.priority;

  const safeStatus: TaskStatus =
    status === "OPEN" || status === "IN_PROGRESS" || status === "DONE" || status === "CANCELLED"
      ? (status as TaskStatus)
      : "OPEN";

  const safePriority: TaskPriority =
    priority === "LOW" || priority === "MEDIUM" || priority === "HIGH" || priority === "CRITICAL"
      ? (priority as TaskPriority)
      : "MEDIUM";

  const coerceDate = (v: unknown): Date | undefined => {
    if (v instanceof Date) return v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return undefined;
  };

  const coerceNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  const estateId = toIdString((base as Record<string, unknown>).estateId) || toIdString(raw.estateId);
  const ownerId = toIdString((base as Record<string, unknown>).ownerId) || toIdString(raw.ownerId);

  return {
    id: base.id,
    subject: typeof base.subject === "string" ? base.subject : "",
    description: typeof base.description === "string" ? base.description : undefined,
    status: safeStatus,
    priority: safePriority,
    dueDate: coerceDate(base.dueDate),
    estimatedMinutes: coerceNumber(base.estimatedMinutes),
    actualMinutes: coerceNumber(base.actualMinutes),
    notes: typeof base.notes === "string" ? base.notes : undefined,
    createdAt: coerceDate(base.createdAt) ?? new Date(0),
    updatedAt: coerceDate(base.updatedAt) ?? new Date(0),
    hours: typeof base.hours === "number" && Number.isFinite(base.hours) ? base.hours : 0,
    estateId,
    ownerId,
  };
}

// Ensure virtuals are included and shape the payload consistently.
TaskSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: unknown) => normalizeTaskSerialized(ret),
});

TaskSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: unknown) => normalizeTaskSerialized(ret),
});

const ExistingTask = mongoose.models.Task as TaskModel | undefined;

export const Task: TaskModel = ExistingTask ?? mongoose.model<TaskDocument, TaskModel>("Task", TaskSchema);