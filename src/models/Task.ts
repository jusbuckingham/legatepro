import { Schema, model, models } from "mongoose";

const TaskSchema = new Schema(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "DONE"],
      default: "OPEN",
    },
    date: { type: Date, required: true },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    subject: { type: String, required: true },      // "Dickerson", "Probate", etc.
    description: { type: String, required: true },  // "Shut off all utilities"
    notes: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const Task = models.Task || model("Task", TaskSchema);