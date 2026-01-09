import mongoose, { Schema, type Model, type ToObjectOptions } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

export interface EstateActivityDocument {
  estateId: string;
  ownerId: string;
  kind: "invoice" | "document" | "task" | "note";
  action: string; // e.g., "status_changed", "created", "updated"
  entityId: string;
  message: string; // Human-readable message for UI
  snapshot?: Record<string, unknown> | null; // Optional before/after data
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

EstateActivitySchema.index({ estateId: 1, createdAt: -1, _id: -1 });
EstateActivitySchema.index({ estateId: 1, kind: 1, action: 1, createdAt: -1, _id: -1 });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> => {
  return isRecord(value) ? value : {};
};

const transform: NonNullable<ToObjectOptions<EstateActivityDocument>["transform"]> = (
  _doc,
  ret
) => {
  return serializeMongoDoc(toRecord(ret));
};

const toJSONOptions: ToObjectOptions<EstateActivityDocument> = {
  virtuals: true,
  versionKey: false,
  transform,
};

const toObjectOptions: ToObjectOptions<EstateActivityDocument> = {
  virtuals: true,
  versionKey: false,
  transform,
};

EstateActivitySchema.set("toJSON", toJSONOptions);
EstateActivitySchema.set("toObject", toObjectOptions);

export const EstateActivity: Model<EstateActivityDocument> =
  mongoose.models.EstateActivity ||
  mongoose.model<EstateActivityDocument>(
    "EstateActivity",
    EstateActivitySchema
  );

export default EstateActivity;