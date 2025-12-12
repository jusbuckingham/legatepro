import mongoose, { Schema, Document, Model } from "mongoose";

export interface EstateActivityDocument extends Document {
  estateId: string;
  ownerId: string;
  kind: "invoice" | "document" | "task" | "note";
  action: string; // e.g., "status_changed", "created", "updated"
  entityId: string;
  message: string; // Human-readable message for UI
  snapshot?: Record<string, unknown>; // Optional before/after data
  createdAt: Date;
}

const EstateActivitySchema = new Schema<EstateActivityDocument>(
  {
    estateId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },

    kind: {
      type: String,
      enum: ["invoice", "document", "task", "note"],
      required: true,
    },

    action: { type: String, required: true },

    entityId: { type: String, required: true },

    message: { type: String, required: true },

    snapshot: { type: Object, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const EstateActivity: Model<EstateActivityDocument> =
  mongoose.models.EstateActivity ||
  mongoose.model<EstateActivityDocument>(
    "EstateActivity",
    EstateActivitySchema
  );

export default EstateActivity;