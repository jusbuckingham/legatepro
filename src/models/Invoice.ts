import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

export type InvoiceLineItemType = "TIME" | "EXPENSE" | "ADJUSTMENT";

export interface InvoiceLineItem {
  _id?: Types.ObjectId;
  type: InvoiceLineItemType;
  label: string;
  /**
   * Optional linkage back to the originating record.
   * For TIME items, this should be a TimeEntry _id.
   * For EXPENSE items, this should be an Expense _id.
   */
  sourceTimeEntryId?: Types.ObjectId;
  sourceExpenseId?: Types.ObjectId;

  quantity: number; // hours for time, 1 for expenses by default, etc.
  rate: number; // hourly rate or unit cost
  amount: number; // quantity * rate (or explicit override)
}

export interface InvoiceAttrs {
  estateId: Types.ObjectId;
  ownerId: Types.ObjectId;

  status?: InvoiceStatus;
  invoiceNumber?: string;
  issueDate?: Date;
  dueDate?: Date;
  paidAt?: Date | null;

  notes?: string;
  currency?: string;

  lineItems?: InvoiceLineItem[];

  subtotal?: number;
  taxRate?: number; // e.g. 0.0–0.15
  taxAmount?: number;
  totalAmount?: number;
}

export interface InvoiceDocument extends Document, InvoiceAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceLineItemSchema = new Schema<InvoiceLineItem>(
  {
    type: {
      type: String,
      enum: ["TIME", "EXPENSE", "ADJUSTMENT"],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    sourceTimeEntryId: {
      type: Schema.Types.ObjectId,
      ref: "TimeEntry",
    },
    sourceExpenseId: {
      type: Schema.Types.ObjectId,
      ref: "Expense",
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  }
);

const InvoiceSchema = new Schema<InvoiceDocument>(
  {
    estateId: {
      type: Schema.Types.ObjectId,
      ref: "Estate",
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["DRAFT", "SENT", "PAID", "VOID"],
      default: "DRAFT",
      index: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      index: true,
    },

    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },

    notes: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      default: "USD",
    },

    lineItems: {
      type: [InvoiceLineItemSchema],
      default: [],
    },

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure invoice numbers are unique per owner, but allow documents without an invoiceNumber.
InvoiceSchema.index(
  { ownerId: 1, invoiceNumber: 1 },
  {
    unique: true,
    sparse: true,
    name: "owner_invoiceNumber_unique",
  }
);

// Keep monetary totals in sync before save.
// This is defensive: callers can set amount explicitly per line,
// but if they don't, we compute from quantity * rate.
InvoiceSchema.pre("save", function (next) {
  const invoice = this as InvoiceDocument;

  const lineItems = invoice.lineItems ?? [];

  const subtotal = lineItems.reduce((sum, item) => {
    const lineAmount =
      typeof item.amount === "number" && !Number.isNaN(item.amount)
        ? item.amount
        : (item.quantity ?? 0) * (item.rate ?? 0);
    return sum + lineAmount;
  }, 0);

  invoice.subtotal = subtotal;

  const taxRate = invoice.taxRate ?? 0;
  const taxAmount = subtotal * taxRate;

  invoice.taxAmount = taxAmount;
  invoice.totalAmount = subtotal + taxAmount;

  next();
});

export const Invoice: Model<InvoiceDocument> =
  (mongoose.models.Invoice as Model<InvoiceDocument>) ||
  mongoose.model<InvoiceDocument>("Invoice", InvoiceSchema);
