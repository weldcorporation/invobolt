import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { getInvoice } from "@/lib/invoices";
import { todayIso } from "@/lib/status";
import { InvoiceEditor } from "./InvoiceEditor";

export const dynamic = "force-dynamic";

/**
 * The workspace editor. `getInvoice` is owner-scoped, so an id belonging to
 * another account is indistinguishable from one that doesn't exist — both 404,
 * leaking nothing about which ids are real.
 */
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const invoice = await getInvoice(userId, id);
  if (!invoice) notFound();

  return (
    <InvoiceEditor
      id={invoice.id}
      initialStatus={invoice.status}
      initialDocument={invoice.document}
      // Resolved on the server and passed down so the derived `overdue` badge
      // renders identically on both sides of hydration — reading the clock in
      // the client component would risk a mismatch.
      today={todayIso()}
    />
  );
}
