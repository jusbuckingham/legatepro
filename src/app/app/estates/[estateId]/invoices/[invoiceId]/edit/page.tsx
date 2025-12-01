import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Invoice } from "@/models/Invoice";
import { InvoiceEditForm } from "@/components/invoices/InvoiceEditForm";

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";

type PageProps = {
  params: Promise<{
    estateId: string;
    invoiceId: string;
  }>;
};

type InvoiceDocForEdit = {
  _id: string | { toString: () => string };
  estateId: string | { toString: () => string };
  status?: string;
  issueDate?: Date;
  dueDate?: Date;
  notes?: string;
  lineItems?: {
    _id?: string | { toString: () => string };
    type?: string;
    label?: string;
    quantity?: number;
    rate?: number;
    amount?: number;
  }[];
};

export default async function EstateInvoiceEditPage({ params }: PageProps) {
  const { estateId, invoiceId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const invoice = (await Invoice.findOne({
    _id: invoiceId,
    ownerId: session.user.id,
    estateId,
  })
    .lean()) as InvoiceDocForEdit | null;

  if (!invoice) {
    notFound();
  }

  const issueDate = invoice.issueDate ?? new Date();
  const dueDate = invoice.dueDate ?? issueDate;

  const initialIssueDate = format(issueDate, "yyyy-MM-dd");
  const initialDueDate = format(dueDate, "yyyy-MM-dd");
  const initialNotes = invoice.notes ?? "";

  const statusUpper = (invoice.status || "DRAFT").toUpperCase() as InvoiceStatus;

  const initialLineItems =
    invoice.lineItems?.map((li, index) => {
      const rawType =
        typeof li.type === "string" ? li.type.toUpperCase() : "ADJUSTMENT";
      const type: "TIME" | "EXPENSE" | "ADJUSTMENT" =
        rawType === "TIME" || rawType === "EXPENSE" || rawType === "ADJUSTMENT"
          ? rawType
          : "ADJUSTMENT";

      const quantity = typeof li.quantity === "number" ? li.quantity : 1;
      const rate = typeof li.rate === "number" ? li.rate : 0;
      const amount =
        typeof li.amount === "number" ? li.amount : quantity * rate;

      const id =
        typeof li._id === "string"
          ? li._id
          : li._id
          ? li._id.toString()
          : `li-${index + 1}`;

      return {
        id,
        type,
        label: li.label ?? "",
        quantity,
        rate,
        amount,
      };
    }) ?? [];

  const normalizedInvoiceId =
    typeof invoice._id === "string"
      ? invoice._id
      : invoice._id.toString();

  const normalizedEstateId =
    typeof invoice.estateId === "string"
      ? invoice.estateId
      : invoice.estateId.toString();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <InvoiceEditForm
        invoiceId={normalizedInvoiceId}
        estateId={normalizedEstateId}
        initialStatus={statusUpper}
        initialIssueDate={initialIssueDate}
        initialDueDate={initialDueDate}
        initialNotes={initialNotes}
        initialLineItems={initialLineItems}
      />
    </div>
  );
}