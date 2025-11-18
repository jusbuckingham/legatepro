// src/models/EstateNote.ts
import {
  Schema,
  model,
  models,
  Model,
  Document,
  Types,
} from "mongoose";

export type NoteCategory = "GENERAL" | "COURT" | "FINANCIAL" | "TASK" | "OTHER";

export interface EstateNoteAttrs {
  ownerId: Types.ObjectId | string;
  estateId: Types.ObjectId | string;
  subject: string;
  body?: string;
  category?: NoteCategory | string;
  isPinned?: boolean;
}

export interface EstateNoteDocument extends EstateNoteAttrs, Document {
  createdAt: Date;
  updatedAt: Date;
}

export type EstateNoteModel = Model<EstateNoteDocument>;

const EstateNoteSchema = new Schema<EstateNoteDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "GENERAL",
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const EstateNote: EstateNoteModel =
  (models.EstateNote as EstateNoteModel) ||
  model<EstateNoteDocument, EstateNoteModel>("EstateNote", EstateNoteSchema);