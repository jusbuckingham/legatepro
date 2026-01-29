import { Schema, model, models, Model, type HydratedDocument } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

export type RentPaymentRecord = {
  estateId: Schema.Types.ObjectId;
  propertyId?: Schema.Types.ObjectId | null;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: Date;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  isLate: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RentPaymentDocument = HydratedDocument<RentPaymentRecord>;

export interface RentPaymentModelType extends Model<RentPaymentRecord> {
  forEstate(estateId: string): Promise<RentPaymentRecord[]>;
  forProperty(estateId: string, propertyId: string): Promise<RentPaymentRecord[]>;
}

const RentPaymentSchema = new Schema<RentPaymentRecord>(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "EstateProperty",
      index: true,
      default: null,
    },
    tenantName: {
      type: String,
      trim: true,
      required: true,
      maxlength: 160,
    },
    periodMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    periodYear: {
      type: Number,
      required: true,
      min: 1900,
      max: 2100,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    method: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: null,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

// ------- INDEXES ------- //
// Estate-wide timeline queries
RentPaymentSchema.index({ estateId: 1, paymentDate: -1 });
// Per-property timeline queries
RentPaymentSchema.index({ estateId: 1, propertyId: 1, paymentDate: -1 });
// Month/year period lookups (e.g., "show me October 2025")
RentPaymentSchema.index({ estateId: 1, periodYear: -1, periodMonth: -1, paymentDate: -1 });

// ------- SERIALIZATION ------- //

type RentPaymentPublic = Omit<RentPaymentRecord, "estateId" | "propertyId"> & {
  id: string;
  estateId: string;
  propertyId?: string;
};

function toPublicRentPayment(input: unknown): RentPaymentPublic {
  // Standardize _id/__v stripping + id creation
  const ret = serializeMongoDoc(input) as Record<string, unknown>;

  // Ensure foreign keys are strings (ObjectId -> string)
  const estateId = ret.estateId as { toString?: () => string } | string | undefined;
  const propertyId = ret.propertyId as { toString?: () => string } | string | undefined;

  if (estateId) {
    ret.estateId = typeof estateId === "string" ? estateId : estateId.toString?.() ?? String(estateId);
  }

  if (propertyId) {
    ret.propertyId = typeof propertyId === "string" ? propertyId : propertyId.toString?.() ?? String(propertyId);
  }

  return ret as RentPaymentPublic;
}

RentPaymentSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: unknown, ret: unknown) => toPublicRentPayment(ret),
});

RentPaymentSchema.set("toObject", {
  virtuals: true,
  transform: (_doc: unknown, ret: unknown) => toPublicRentPayment(ret),
});

// ------- STATICS ------- //

RentPaymentSchema.statics.forEstate = function (estateId: string) {
  return this.find({ estateId })
    .sort({ paymentDate: -1 })
    .select("-__v")
    .lean()
    .exec()
    .then((rows: unknown[]) => rows.map((r: unknown) => toPublicRentPayment(r)));
};

RentPaymentSchema.statics.forProperty = function (estateId: string, propertyId: string) {
  return this.find({ estateId, propertyId })
    .sort({ paymentDate: -1 })
    .select("-__v")
    .lean()
    .exec()
    .then((rows: unknown[]) => rows.map((r: unknown) => toPublicRentPayment(r)));
};

export const RentPayment =
  (models.RentPayment as RentPaymentModelType) ||
  model<RentPaymentRecord, RentPaymentModelType>("RentPayment", RentPaymentSchema);