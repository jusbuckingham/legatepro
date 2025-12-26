import { Schema, model, models, type Document, type Model } from "mongoose";

export type EstateEventType =
  | "ESTATE_CREATED"
  | "ESTATE_UPDATED"
  | "ESTATE_DELETED"
  | "INVOICE_CREATED"
  | "INVOICE_STATUS_CHANGED"
  | "CONTACT_LINKED"
  | "CONTACT_UNLINKED"
  | "COLLABORATOR_ADDED"
  | "COLLABORATOR_ROLE_CHANGED"
  | "COLLABORATOR_REMOVED"
  | "COLLABORATOR_INVITE_SENT"
  | "COLLABORATOR_INVITE_REVOKED"
  | "COLLABORATOR_INVITE_ACCEPTED";

export interface EstateEventDocument extends Document {
  ownerId: Schema.Types.ObjectId | string;
  estateId: Schema.Types.ObjectId | string;
  type: EstateEventType;
  summary: string;
  detail?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const EstateEventSchema = new Schema<EstateEventDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "ESTATE_CREATED",
        "ESTATE_UPDATED",
        "ESTATE_DELETED",
        "INVOICE_CREATED",
        "INVOICE_STATUS_CHANGED",
        "CONTACT_LINKED",
        "CONTACT_UNLINKED",
        "COLLABORATOR_ADDED",
        "COLLABORATOR_ROLE_CHANGED",
        "COLLABORATOR_REMOVED",
        "COLLABORATOR_INVITE_SENT",
        "COLLABORATOR_INVITE_REVOKED",
        "COLLABORATOR_INVITE_ACCEPTED",
      ],
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    detail: {
      type: String,
      trim: true,
    },
    meta: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

export const EstateEvent: Model<EstateEventDocument> =
  (models.EstateEvent as Model<EstateEventDocument>) ||
  model<EstateEventDocument>("EstateEvent", EstateEventSchema);