import mongoose, { Schema } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

/**
 * EstateEvent types + normalization helpers.
 *
 * NOTE: This module exports BOTH:
 * - the Mongoose model (default export)
 * - pure type helpers for event types (named exports)
 *
 * Logging lives in `src/lib/estateEvents.ts`.
 */

export const ESTATE_EVENT_TYPES = [
  "ESTATE_CREATED",
  "ESTATE_UPDATED",
  "ESTATE_DELETED",

  "INVOICE_CREATED",
  "INVOICE_STATUS_CHANGED",

  "DOCUMENT_CREATED",
  "DOCUMENT_UPDATED",
  "DOCUMENT_DELETED",

  "NOTE_CREATED",
  "NOTE_UPDATED",
  "NOTE_PINNED",
  "NOTE_UNPINNED",
  "NOTE_DELETED",

  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMPLETED",
  "TASK_REOPENED",
  "TASK_DELETED",

  "CONTACT_LINKED",
  "CONTACT_UNLINKED",

  "COLLABORATOR_ADDED",
  "COLLABORATOR_ROLE_CHANGED",
  "COLLABORATOR_REMOVED",
  "COLLABORATOR_INVITE_SENT",
  "COLLABORATOR_INVITE_REVOKED",
  "COLLABORATOR_INVITE_ACCEPTED",
] as const;

export type EstateEventCanonicalType = (typeof ESTATE_EVENT_TYPES)[number];

/**
 * Aliases/legacy names that may appear in older code paths.
 * Always normalize to a canonical value before persisting.
 */
export const ESTATE_EVENT_TYPE_ALIASES = {
  // Documents
  DOCUMENT_ADDED: "DOCUMENT_CREATED",
  DOCUMENT_REMOVED: "DOCUMENT_DELETED",
  DOCUMENT_UPSERTED: "DOCUMENT_UPDATED",

  // Notes
  NOTE_EDITED: "NOTE_UPDATED",
  NOTE_ARCHIVED: "NOTE_DELETED",

  // Tasks
  TASK_DONE: "TASK_COMPLETED",
  TASK_UNDONE: "TASK_REOPENED",

  // Invoices
  INVOICE_SENT: "INVOICE_STATUS_CHANGED",
  INVOICE_PAID: "INVOICE_STATUS_CHANGED",
  INVOICE_VOID: "INVOICE_STATUS_CHANGED",

  // Contacts
  CONTACT_ADDED: "CONTACT_LINKED",
  CONTACT_REMOVED: "CONTACT_UNLINKED",
} as const;

export type EstateEventAliasType = keyof typeof ESTATE_EVENT_TYPE_ALIASES;

/**
 * Accept either canonical or known alias types.
 */
export type EstateEventType = EstateEventCanonicalType | EstateEventAliasType;

const CANONICAL_SET: ReadonlySet<string> = new Set(ESTATE_EVENT_TYPES);

export function normalizeEstateEventType(input: string): EstateEventCanonicalType {
  const raw = (input ?? "").trim().toUpperCase();

  if (!raw) return "ESTATE_UPDATED";

  const aliased = (ESTATE_EVENT_TYPE_ALIASES as Record<string, EstateEventCanonicalType>)[raw];
  if (aliased) return aliased;

  if (CANONICAL_SET.has(raw)) return raw as EstateEventCanonicalType;

  // Fail-safe: keep event logging resilient.
  return "ESTATE_UPDATED";
}

/* -------------------- Mongoose model -------------------- */



const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const serializeRet = (ret: unknown) => serializeMongoDoc(isRecord(ret) ? ret : {});

export interface EstateEventRecord {
  estateId: string;
  ownerId: string;
  type: EstateEventCanonicalType;

  // Optional linkage to an entity involved (invoice/task/note/etc.)
  entityId?: string | null;

  summary: string;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const EstateEventSchema = new Schema<EstateEventRecord>(
  {
    estateId: { type: String, required: true, trim: true, index: true },
    ownerId: { type: String, required: true, trim: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ESTATE_EVENT_TYPES,
      set: (value: unknown) => normalizeEstateEventType(String(value ?? "")),
    },
    // Optional linkage to an entity (invoice/task/note/etc.)
    entityId: { type: String, default: null, trim: true },
    summary: { type: String, required: true, trim: true, maxlength: 240 },
    // Optional freeform detail; keep null as the absence value (not empty string).
    detail: { type: String, default: null, trim: true, maxlength: 4000 },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => serializeRet(ret),
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => serializeRet(ret),
    },
  }
);

// Timeline/query performance indexes
// Use _id as a deterministic tiebreaker when multiple docs share the same createdAt.
EstateEventSchema.index({ estateId: 1, createdAt: -1, _id: -1 });
// Common filter: estateId + type, sorted by newest first
EstateEventSchema.index({ estateId: 1, type: 1, createdAt: -1, _id: -1 });
// Owner-scoped feed (across estates)
EstateEventSchema.index({ ownerId: 1, createdAt: -1, _id: -1 });

const EstateEvent =
  (mongoose.models.EstateEvent as mongoose.Model<EstateEventRecord> | undefined) ??
  mongoose.model<EstateEventRecord>("EstateEvent", EstateEventSchema);

export default EstateEvent;