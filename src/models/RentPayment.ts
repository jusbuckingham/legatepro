import { Schema, model, models, Model, Document } from "mongoose";

export interface RentPaymentDocument extends Document {
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
}

export interface RentPaymentModelType extends Model<RentPaymentDocument> {
  forEstate(estateId: string): Promise<RentPaymentDocument[]>;
  forProperty(estateId: string, propertyId: string): Promise<RentPaymentDocument[]>;
}

const RentPaymentSchema = new Schema<RentPaymentDocument>(
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

// ------- STATICS ------- //

RentPaymentSchema.statics.forEstate = function (estateId: string) {
  return this.find({ estateId }).sort({ paymentDate: -1 }).lean();
};

RentPaymentSchema.statics.forProperty = function (
  estateId: string,
  propertyId: string
) {
  return this.find({ estateId, propertyId }).sort({ paymentDate: -1 }).lean();
};

export const RentPayment =
  (models.RentPayment as RentPaymentModelType) ||
  model<RentPaymentDocument, RentPaymentModelType>(
    "RentPayment",
    RentPaymentSchema
  );