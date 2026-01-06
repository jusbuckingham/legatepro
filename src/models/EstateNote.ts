import mongoose, { Schema, Document, Model } from "mongoose";

export interface EstateNoteDocument extends Document {
  estateId: string;
  ownerId: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EstateNoteSchema = new Schema<EstateNoteDocument>(
  {
    estateId: {
      type: String,
      required: true,
      index: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: { [key: string]: unknown; _id?: unknown; __v?: unknown; id?: unknown }) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: { [key: string]: unknown; _id?: unknown; __v?: unknown; id?: unknown }) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

EstateNoteSchema.index({ estateId: 1, createdAt: -1 });

export const EstateNote: Model<EstateNoteDocument> =
  mongoose.models.EstateNote ||
  mongoose.model<EstateNoteDocument>("EstateNote", EstateNoteSchema);

export default EstateNote;