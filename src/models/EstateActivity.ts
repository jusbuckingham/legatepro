import mongoose, { Schema, type Model, type Types, type ToObjectOptions } from "mongoose";

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

type EstateActivityTransformRet = Record<string, unknown> & {
  _id?: Types.ObjectId;
  __v?: unknown;
  id?: string;
};

function serializeEstateActivity(
  _doc: unknown,
  ret: EstateActivityTransformRet,
  _options?: unknown
) {
  // Avoid unused-var lint in some configs.
  void _doc;
  void _options;

  // Preserve a stable id field for client usage.
  const _id = ret._id;
  const id = ret.id;

  if (_id != null && typeof id !== "string") {
    ret.id = String(_id);
  }

  // Remove Mongo internals.
  delete ret._id;
  delete ret.__v;

  return ret;
}

const transform =
  serializeEstateActivity as unknown as NonNullable<
    ToObjectOptions<EstateActivityDocument>["transform"]
  >;

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