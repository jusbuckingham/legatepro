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
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const EstateNote: Model<EstateNoteDocument> =
  mongoose.models.EstateNote ||
  mongoose.model<EstateNoteDocument>("EstateNote", EstateNoteSchema);

export default EstateNote;