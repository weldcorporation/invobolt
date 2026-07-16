import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { isEmailEnabled } from "@/lib/email";
import { getInvoice } from "@/lib/invoices";
import { listClients } from "@/lib/clients";
import { listItems } from "@/lib/items";
import { scheduleForInvoice } from "@/lib/schedules";
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

  const [invoice, savedClients, savedItems, schedule] = await Promise.all([
    getInvoice(userId, id),
    listClients(userId),
    listItems(userId),
    scheduleForInvoice(userId, id),
  ]);
  if (!invoice) notFound();

  return (
    <InvoiceEditor
      id={invoice.id}
      initialStatus={invoice.status}
      initialDocument={invoice.document}
      savedClients={savedClients}
      savedItems={savedItems}
      initialShareToken={invoice.shareToken}
      initialPaymentLink={invoice.paymentLinkUrl}
      emailEnabled={isEmailEnabled()}
      hasSchedule={schedule !== null}
      // Resolved on the server and passed down so the derived `overdue` badge
      // renders identically on both sides of hydration — reading the clock in
      // the client component would risk a mismatch.
      today={todayIso()}
    />
  );
}
