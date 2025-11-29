import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export default async function EstateInvoiceNewRedirect({ params }: PageProps) {
  const { estateId } = await params;

  if (!estateId || estateId === "undefined") {
    redirect("/app/estates");
  }

  // Send the user to the global invoice builder, pre-filtered by this estate
  redirect(`/app/invoices/new?estateId=${encodeURIComponent(estateId)}`);
}