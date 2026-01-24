// src/models/Estate.ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";
import type { ReadinessPlan } from "@/lib/ai/readinessPlan";

export type EstateRole = "OWNER" | "EDITOR" | "VIEWER";

export interface EstateCollaborator {
  userId: string;
  role: EstateRole;
  addedAt?: Date;
}

export type InviteRole = Exclude<EstateRole, "OWNER">;
export type EstateInviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface EstateInvite {
  token: string;
  email: string;
  role: InviteRole;
  status: EstateInviteStatus;
  createdBy: string;
  createdAt?: Date;
  expiresAt?: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  revokedAt?: Date;
}

// Detailed decedent info (optional, but keeps room for your richer spreadsheet data)
interface DecedentDetails {
  fullName?: string;
  dateOfBirth?: Date;
  dateOfDeath?: Date;
  ssnLast4?: string;
  primaryAddress?: string;
  altAddress?: string;
  driversLicenseNumber?: string;
  phoneNumber?: string;
  chaseCheckingLast4?: string;
  estateAccountNumberLast4?: string;
  estateRoutingNumber?: string;
  estateWireNumberLast4?: string;
  encryptedDataBlob?: string;
}

// Personal representative compensation settings
interface CompensationSettings {
  feeType?: "HOURLY" | "PERCENTAGE" | "FLAT";
  hourlyRate?: number;
  percentageRate?: number;
  flatAmount?: number;
}

export interface IEstate {
  ownerId: string; // user who owns this estate workspace

  collaborators?: EstateCollaborator[]; // additional users with access

  invites?: EstateInvite[]; // pending/accepted collaborator invites (invite-link flow)

  // Top-level names used throughout the UI & API
  decedentName?: string; // e.g. "Donald Buckingham"
  name?: string; // optional label, e.g. "Estate of Donald Buckingham"

  // Optional richer decedent block for more advanced flows
  decedent?: DecedentDetails;

  // Court info
  courtCounty?: string;
  courtState?: string;
  caseNumber?: string;

  // Personal representative compensation config
  compensation?: CompensationSettings;

  status?: "OPEN" | "CLOSED";

  // Cached readiness copilot plan (persisted for fast reloads + diffing)
  readinessPlan?: ReadinessPlan | null;

  // Convenience fields for filtering/TTL checks without parsing Mixed
  readinessPlanGeneratedAt?: Date;
  readinessPlanGenerator?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface EstateDocument extends IEstate, Document {}

const DecedentSchema = new Schema<DecedentDetails>(
  {
    fullName: { type: String },
    dateOfBirth: { type: Date },
    dateOfDeath: { type: Date },
    ssnLast4: { type: String },
    primaryAddress: { type: String },
    altAddress: { type: String },
    driversLicenseNumber: { type: String },
    phoneNumber: { type: String },
    chaseCheckingLast4: { type: String },
    estateAccountNumberLast4: { type: String },
    estateRoutingNumber: { type: String },
    estateWireNumberLast4: { type: String },
    encryptedDataBlob: { type: String },
  },
  { _id: false }
);

const CompensationSchema = new Schema<CompensationSettings>(
  {
    feeType: {
      type: String,
      enum: ["HOURLY", "PERCENTAGE", "FLAT"],
      default: "HOURLY",
    },
    hourlyRate: { type: Number, default: 0 },
    percentageRate: { type: Number },
    flatAmount: { type: Number },
  },
  { _id: false }
);

const CollaboratorSchema = new Schema<EstateCollaborator>(
  {
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ["OWNER", "EDITOR", "VIEWER"], required: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const InviteSchema = new Schema<EstateInvite>(
  {
    token: { type: String, required: true, index: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: { type: String, enum: ["EDITOR", "VIEWER"], required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    createdBy: { type: String, required: true, index: true },
    createdAt: { type: Date, default: () => new Date(), index: true },
    expiresAt: { type: Date, required: false, index: true },
    acceptedBy: { type: String, required: false, index: true },
    acceptedAt: { type: Date, required: false },
    revokedAt: { type: Date, required: false },
  },
  { _id: false }
);

const EstateSchema = new Schema<EstateDocument>(
  {
    ownerId: { type: String, required: true, index: true },

    collaborators: { type: [CollaboratorSchema], default: [] },

    invites: { type: [InviteSchema], default: [] },

    // Primary names used in the UI & filters
    decedentName: { type: String, required: false, trim: true },
    name: { type: String, required: false, trim: true },

    decedent: { type: DecedentSchema, required: false },

    courtCounty: { type: String, required: false, trim: true, index: true },
    courtState: { type: String, required: false, trim: true, index: true },
    caseNumber: { type: String, required: false, trim: true, index: true },

    compensation: { type: CompensationSchema, required: false, default: {} },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      set: (val: string | undefined) => (typeof val === "string" ? val.toUpperCase() : val),
    },

    readinessPlan: {
      type: Schema.Types.Mixed,
      default: null,
    },
    readinessPlanGeneratedAt: {
      type: Date,
      default: null,
      index: true,
    },
    readinessPlanGenerator: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => serializeMongoDoc(ret),
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => serializeMongoDoc(ret),
    },
  }
);

// Common list queries (by owner, most recently updated)
EstateSchema.index({ ownerId: 1, updatedAt: -1 });

// Filtered list queries (by owner + status)
EstateSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });

// Name-based lookups within an owner workspace
EstateSchema.index({ ownerId: 1, decedentName: 1 });

// Fast collaborator membership lookups
EstateSchema.index({ "collaborators.userId": 1, updatedAt: -1 });

// Fast invite lookups by email + status
EstateSchema.index({ "invites.email": 1, "invites.status": 1 });

// Readiness plan recency lookups

EstateSchema.index({ ownerId: 1, readinessPlanGeneratedAt: -1 });

function extractReadinessPlanMeta(plan: unknown): {
  generatedAt: Date | null;
  generator: string | null;
} {
  if (!plan || typeof plan !== "object") {
    return { generatedAt: null, generator: null };
  }

  const p = plan as { generatedAt?: unknown; generator?: unknown };

  let generatedAt: Date | null = null;
  if (p.generatedAt instanceof Date) {
    generatedAt = p.generatedAt;
  } else if (typeof p.generatedAt === "string") {
    const d = new Date(p.generatedAt);
    generatedAt = Number.isNaN(d.getTime()) ? null : d;
  }

  const generator = typeof p.generator === "string" && p.generator.trim().length > 0 ? p.generator.trim() : null;

  return { generatedAt, generator };
}

// Keep convenience fields in sync whenever readinessPlan changes
EstateSchema.pre("save", function syncReadinessPlanMeta(next) {
  if (!this.isModified("readinessPlan")) return next();

  const { generatedAt, generator } = extractReadinessPlanMeta((this as unknown as { readinessPlan?: unknown }).readinessPlan);

  (this as unknown as { readinessPlanGeneratedAt?: Date | null }).readinessPlanGeneratedAt = generatedAt;
  (this as unknown as { readinessPlanGenerator?: string | null }).readinessPlanGenerator = generator;

  next();
});

EstateSchema.pre("findOneAndUpdate", function syncReadinessPlanMetaOnUpdate(next) {
  const update = this.getUpdate() as
    | { $set?: Record<string, unknown>; readinessPlan?: unknown }
    | Record<string, unknown>
    | undefined;

  if (!update) return next();

  const $set = (update as { $set?: Record<string, unknown> }).$set;

  const nextPlan =
    $set && Object.prototype.hasOwnProperty.call($set, "readinessPlan")
      ? $set.readinessPlan
      : Object.prototype.hasOwnProperty.call(update, "readinessPlan")
        ? (update as { readinessPlan?: unknown }).readinessPlan
        : undefined;

  if (typeof nextPlan === "undefined") return next();

  const { generatedAt, generator } = extractReadinessPlanMeta(nextPlan);

  // Ensure we write via $set for atomic updates
  if ($set) {
    $set.readinessPlanGeneratedAt = generatedAt;
    $set.readinessPlanGenerator = generator;
  } else {
    (update as Record<string, unknown>).$set = {
      readinessPlanGeneratedAt: generatedAt,
      readinessPlanGenerator: generator,
    };
  }

  next();
});

let EstateModel: Model<EstateDocument>;

try {
  EstateModel = mongoose.model<EstateDocument>("Estate");
} catch {
  EstateModel = mongoose.model<EstateDocument>("Estate", EstateSchema);
}

export const Estate = EstateModel;
