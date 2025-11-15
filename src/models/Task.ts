import {
  Schema,
  model,
  models,
  type Model,
  type HydratedDocument,
  type InferSchemaType,
  Types,
} from "mongoose";

const TaskSchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "DONE"] as const,
      default: "OPEN",
    },
    date: {
      type: Date,
      required: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"] as const,
      default: "MEDIUM",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export type TaskSchemaType = InferSchemaType<typeof TaskSchema> & {
  estateId: Types.ObjectId;
};

export type TaskDocument = HydratedDocument<TaskSchemaType>;

export type TaskModelType = Model<TaskSchemaType>;

export const Task: TaskModelType =
  (models.Task as TaskModelType) || model<TaskSchemaType>("Task", TaskSchema);