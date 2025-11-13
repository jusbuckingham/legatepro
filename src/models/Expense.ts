import mongoose, { Schema, Document, Model, Types } from "mongoose";

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
  | "OTHER";

export interface IExpense {
  ownerId: string; // user who owns this expense
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

export interface ExpenseDocument extends IExpense, Document {}

const ExpenseSchema = new Schema<ExpenseDocument>(
  {
    ownerId: { type: String, required: true, index: true },

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

let ExpenseModel: Model<ExpenseDocument>;

try {
  ExpenseModel = mongoose.model<ExpenseDocument>("Expense");
} catch {
  ExpenseModel = mongoose.model<ExpenseDocument>("Expense", ExpenseSchema);
}

export const Expense = ExpenseModel;
