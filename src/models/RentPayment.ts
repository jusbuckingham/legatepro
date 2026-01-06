import { Schema, model, models, Model, type HydratedDocument } from "mongoose";

export type RentPaymentRecord = {
  estateId: Schema.Types.ObjectId;
  propertyId?: Schema.Types.ObjectId;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: Date;
  method?: string;
  reference?: string;
  notes?: string;
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
    },
    tenantName: {
      type: String,
      trim: true,
      required: true,
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
    },
    reference: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ------- INDEXES ------- //
// Estate-wide timeline queries
RentPaymentSchema.index({ estateId: 1, paymentDate: -1 });
// Per-property timeline queries
RentPaymentSchema.index({ estateId: 1, propertyId: 1, paymentDate: -1 });

// ------- SERIALIZATION ------- //
RentPaymentSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.__v;
    return ret;
  },
});

RentPaymentSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.__v;
    return ret;
  },
});

// ------- STATICS ------- //

RentPaymentSchema.statics.forEstate = function (estateId: string) {
  return this.find({ estateId }).sort({ paymentDate: -1 }).lean().exec();
};

RentPaymentSchema.statics.forProperty = function (estateId: string, propertyId: string) {
  return this.find({ estateId, propertyId }).sort({ paymentDate: -1 }).lean().exec();
};

export const RentPayment =
  (models.RentPayment as RentPaymentModelType) ||
  model<RentPaymentRecord, RentPaymentModelType>("RentPayment", RentPaymentSchema);