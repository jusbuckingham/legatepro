// src/models/Task.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

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
  description?: string;

  // Status / workflow
  status: TaskStatus;
  priority: TaskPriority;

  // Time + estimation
  dueDate?: Date;
  estimatedMinutes?: number;
  actualMinutes?: number;

  // Misc
  notes?: string;

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
    },
    description: {
      type: String,
      trim: true,
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
    },
  },
  {
    timestamps: true,
  },
);

// Helpful indexes for querying "what do I need to do next?"
TaskSchema.index({ estateId: 1, status: 1, priority: 1, dueDate: 1 });
TaskSchema.index({ ownerId: 1, status: 1, dueDate: 1 });

/**
 * Virtual: hours derived from actualMinutes.
 */
TaskSchema.virtual("hours").get(function (this: TaskDocument) {
  const mins = this.actualMinutes ?? this.estimatedMinutes ?? 0;
  return mins / 60;
});

// Public/serialized shape used by API/UI layers.
export type TaskSerialized = Omit<TaskDocLean, "_id" | "estateId" | "ownerId"> & {
  id: string;
  estateId: string;
  ownerId: string;
};

function normalizeTaskSerialized(input: unknown): TaskSerialized {
  const ret = input as Record<string, unknown>;

  const _id = ret._id as unknown;
  const estateId = ret.estateId as unknown;
  const ownerId = ret.ownerId as unknown;

  const out: Record<string, unknown> = { ...ret };

  // Stable string ids
  if (_id != null) out.id = String(_id);
  if (estateId != null) out.estateId = String(estateId);
  if (ownerId != null) out.ownerId = String(ownerId);

  // Strip mongoose internals
  delete out._id;
  delete out.__v;

  return out as unknown as TaskSerialized;
}

// Ensure virtuals are included and shape the payload consistently.
TaskSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => normalizeTaskSerialized(ret),
});

TaskSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => normalizeTaskSerialized(ret),
});

export const Task: TaskModel =
  (mongoose.models.Task as TaskModel) ||
  mongoose.model<TaskDocument, TaskModel>("Task", TaskSchema);