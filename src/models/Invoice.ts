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
  rate: number; // hourly rate or unit cost, stored in minor units (e.g. cents)
  amount: number; // quantity * rate (or explicit override), stored in minor units (e.g. cents)
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

  subtotal?: number; // stored in minor units (e.g. cents)
  taxRate?: number; // e.g. 0.0–0.15, percentage as a fraction
  taxAmount?: number; // stored in minor units (e.g. cents)
  totalAmount?: number; // stored in minor units (e.g. cents)
}

export interface InvoiceDocument extends Document, InvoiceAttrs {
  createdAt: Date;
  updatedAt: Date;

  // Virtuals (not persisted)
  isPaid: boolean;
  isVoid: boolean;
  isOverdue: boolean;
  balanceDue: number;
}

type InvoiceTransformRet = Record<string, unknown> & {
  _id?: unknown;
  __v?: unknown;
  id?: string;
};

const normalizeInvoiceTransform = (_doc: unknown, ret: InvoiceTransformRet) => {
  if (ret._id != null) ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
};

function safeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function nowUtc(): Date {
  // Date() is UTC internally; this is just a semantic wrapper.
  return new Date();
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
      maxlength: 240,
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
    id: false,
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
      maxlength: 64,
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
      maxlength: 4000,
      default: null,
    },
    currency: {
      type: String,
      default: "USD",
      uppercase: true,
      minlength: 3,
      maxlength: 3,
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
      max: 1,
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
    minimize: false,
    toJSON: {
      virtuals: true,
      transform: normalizeInvoiceTransform,
    },
    toObject: {
      virtuals: true,
      transform: normalizeInvoiceTransform,
    },
  }
);

// Timeline / listing performance: fetch latest invoices for an estate.
// (Pairs well with cursor pagination using createdAt + _id.)
InvoiceSchema.index(
  { estateId: 1, createdAt: -1, _id: -1 },
  { name: "estate_createdAt_desc" }
);

// Common filter: status within an estate.
InvoiceSchema.index(
  { estateId: 1, status: 1, createdAt: -1, _id: -1 },
  { name: "estate_status_createdAt_desc" }
);

// Owner dashboard / global lists: recent invoices for an owner.
InvoiceSchema.index(
  { ownerId: 1, createdAt: -1, _id: -1 },
  { name: "owner_createdAt_desc" }
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

// --------
// Virtuals
// --------
InvoiceSchema.virtual("isPaid").get(function (this: InvoiceDocument) {
  return this.status === "PAID" || !!this.paidAt;
});

InvoiceSchema.virtual("isVoid").get(function (this: InvoiceDocument) {
  return this.status === "VOID";
});

InvoiceSchema.virtual("isOverdue").get(function (this: InvoiceDocument) {
  if (this.status === "PAID" || this.status === "VOID") return false;
  const due = safeDate(this.dueDate);
  if (!due) return false;
  return due.getTime() < nowUtc().getTime();
});

InvoiceSchema.virtual("balanceDue").get(function (this: InvoiceDocument) {
  // Minor units (e.g. cents). If paid/void, balance is 0.
  if (this.status === "PAID" || this.status === "VOID") return 0;
  const total = typeof this.totalAmount === "number" && !Number.isNaN(this.totalAmount) ? this.totalAmount : 0;
  return Math.max(0, Math.round(total));
});

// Keep monetary totals in sync before save.
// This is defensive: callers can set amount explicitly per line,
// but if they don't, we compute from quantity * rate.
InvoiceSchema.pre("save", function (this: InvoiceDocument, next) {
  const lineItems = Array.isArray(this.lineItems) ? (this.lineItems as InvoiceLineItem[]) : [];

  // Normalize each line item to integer minor units and compute subtotal from that.
  let subtotal = 0;
  for (const item of lineItems) {
    const qty = typeof item.quantity === "number" && !Number.isNaN(item.quantity) ? item.quantity : 0;
    const rate = typeof item.rate === "number" && !Number.isNaN(item.rate) ? item.rate : 0;

    const computed = qty * rate;
    const rawLineAmount =
      typeof item.amount === "number" && !Number.isNaN(item.amount) ? item.amount : computed;

    const lineAmount = Math.round(rawLineAmount);

    // Persist normalized amount back onto the doc so we don't store floats.
    item.amount = lineAmount;

    subtotal += lineAmount;
  }

  this.subtotal = subtotal;

  const taxRate = this.taxRate ?? 0;
  const taxAmount = Math.round(subtotal * taxRate);

  this.taxAmount = taxAmount;
  this.totalAmount = subtotal + taxAmount;

  next();
});

const ExistingInvoice = mongoose.models.Invoice as Model<InvoiceDocument> | undefined;

export const Invoice: Model<InvoiceDocument> =
  ExistingInvoice ?? mongoose.model<InvoiceDocument>("Invoice", InvoiceSchema);
