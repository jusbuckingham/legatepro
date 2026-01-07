import mongoose, { Schema, Model, Types, type HydratedDocument } from "mongoose";

export type ExpenseCategory =
  | "FUNERAL"
  | "PROBATE"
  | "PROPERTY"
  | "UTILITIES"
  | "TAXES"
  | "MAINTENANCE"
  | "INSURANCE"
  | "LEGAL"
  | "ACCOUNTING"
  | "OTHER"
  | "REPAIRS"
  | "COURT_FEES";

export interface IExpense {
  ownerId: Types.ObjectId | string; // user who owns this expense (Mongo ObjectId or string)
  estateId: Types.ObjectId; // required

  date: Date;
  category: ExpenseCategory;
  description: string;
  amount: number;

  payee?: string;
  notes?: string;

  isPaid?: boolean;

  propertyId?: Types.ObjectId;
  utilityAccountId?: Types.ObjectId;
  documentId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type ExpenseDocument = HydratedDocument<IExpense>;

export interface ExpenseModelType extends Model<ExpenseDocument> {
  /**
   * Fetch all expenses for a given estate, newest first.
   */
  forEstate(estateId: Types.ObjectId | string): Promise<ExpenseDocument[]>;

  /**
   * Fetch all expenses for a given owner + estate combo, newest first.
   * Useful for scoping to the logged-in user.
   */
  forUserEstate(
    ownerId: Types.ObjectId | string,
    estateId: Types.ObjectId | string,
  ): Promise<ExpenseDocument[]>;
}

const ExpenseSchema = new Schema<ExpenseDocument>(
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

    date: { type: Date, required: true },

    category: {
      type: String,
      enum: [
        "FUNERAL",
        "PROBATE",
        "PROPERTY",
        "UTILITIES",
        "TAXES",
        "MAINTENANCE",
        "INSURANCE",
        "LEGAL",
        "ACCOUNTING",
        "OTHER",
        "REPAIRS",
        "COURT_FEES",
      ],
      required: true,
      default: "OTHER",
    },

    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },

    payee: { type: String, trim: true },
    notes: { type: String, trim: true },

    isPaid: { type: Boolean, default: true },

    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "EstateProperty",
      required: false,
    },

    utilityAccountId: {
      type: Schema.Types.ObjectId,
      ref: "UtilityAccount",
      required: false,
    },

    documentId: {
      type: Schema.Types.ObjectId,
      ref: "EstateDocument",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes tuned for common list + timeline queries
ExpenseSchema.index({ estateId: 1, date: -1, createdAt: -1 });
ExpenseSchema.index({ ownerId: 1, estateId: 1, date: -1, createdAt: -1 });
ExpenseSchema.index({ estateId: 1, category: 1, date: -1 });

// Normalize output shape for the app

type ExpenseTransformable = Record<string, unknown> & { _id?: unknown; __v?: unknown };

function transformExpenseRet(ret: unknown): Record<string, unknown> & { id: string } {
  const r = ret as unknown as ExpenseTransformable;
  const { _id, __v: _v, ...rest } = r;
  void _v;
  return { id: String(_id), ...rest };
}

ExpenseSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => transformExpenseRet(ret),
});

ExpenseSchema.set("toObject", {
  virtuals: true,
  transform: (_doc, ret) => transformExpenseRet(ret),
});

ExpenseSchema.statics.forEstate = function (estateId: Types.ObjectId | string): Promise<ExpenseDocument[]> {
  return this.find({ estateId }).sort({ date: -1, createdAt: -1 }).exec();
};

ExpenseSchema.statics.forUserEstate = function (
  ownerId: Types.ObjectId | string,
  estateId: Types.ObjectId | string,
): Promise<ExpenseDocument[]> {
  return this.find({ ownerId, estateId })
    .sort({ date: -1, createdAt: -1 })
    .exec();
};

let ExpenseModel: ExpenseModelType;

try {
  ExpenseModel = mongoose.model<ExpenseDocument>("Expense") as ExpenseModelType;
} catch {
  ExpenseModel = mongoose.model<ExpenseDocument, ExpenseModelType>(
    "Expense",
    ExpenseSchema
  );
}

export const Expense = ExpenseModel;
