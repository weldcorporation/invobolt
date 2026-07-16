/**
 * The one send path (v0.3), shared by the editor's Send button and the
 * recurring generator's auto-send — so the cap, the share-link reuse, and the
 * draft → sent transition cannot drift between the two.
 *
 * Composition over the existing pieces: mint the share token (`shareInvoice`
 * is idempotent), deliver a link to `/i/[token]`, log the send, and move
 * `draft → sent` through the same atomic transition the status buttons use.
 * Callers check `isEmailEnabled()` and supply the deployment origin; this
 * checks everything about the invoice and the recipient.
 */

import "server-only";
import { dailyEmailCap, deliverEmail } from "./email";
import { countSendsSince, logSend } from "./emails";
import { buildInvoiceEmail, isEmailAddress } from "./invoice-email";
import { validateInvoice } from "./invoice-row";
import { getInvoice, setInvoiceStatus, shareInvoice } from "./invoices";

export type SendOutcome =
  | { ok: true; token: string; to: string }
  | { ok: false; error: string };

export async function sendInvoiceEmailFlow(
  userId: string,
  invoiceId: string,
  to: string,
  origin: string,
): Promise<SendOutcome> {
  // The recipient becomes an SMTP address, so the shape check doubles as
  // header-injection protection — whether it came from a form or a stored
  // client record.
  const recipient = to.trim();
  if (!isEmailAddress(recipient)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const invoice = await getInvoice(userId, invoiceId);
  if (!invoice) return { ok: false, error: "This invoice no longer exists." };
  if (invoice.status === "void") {
    return { ok: false, error: "This invoice is void — restore it first." };
  }

  const problems = validateInvoice(invoice.document);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  // The daily cap: an indexed count over the send log, checked up front so a
  // capped user costs one query, not a provider call. Two racing sends can
  // each pass at cap-minus-one; the cap is anti-abuse, not accounting.
  const cap = dailyEmailCap();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await countSendsSince(userId, dayAgo)) >= cap) {
    return {
      ok: false,
      error: `Sending is limited to ${cap} emails per day — try again later.`,
    };
  }

  const token = await shareInvoice(userId, invoiceId);
  if (!token) return { ok: false, error: "This invoice no longer exists." };

  const email = buildInvoiceEmail(
    invoice.document,
    `${origin}/i/${token}`,
    invoice.paymentLinkUrl,
  );

  let providerId: string | null;
  try {
    ({ providerId } = await deliverEmail(recipient, email.subject, email.text));
  } catch (error) {
    console.error("Invoice email failed:", error);
    return {
      ok: false,
      error: "The email couldn't be sent — nothing was delivered. Try again.",
    };
  }

  // Past this line the provider has accepted the email: it is going to arrive,
  // and nothing that fails now can un-send it. So the bookkeeping gets its own
  // catch and the send is still reported as the success it was.
  //
  // Reporting a delivered email as a failure is the worse bug it looks like a
  // fix for: the user reads "nothing was sent", presses Send again, and their
  // client gets the invoice twice — while the first send sits unlogged, outside
  // the audit trail and uncounted against the cap.
  try {
    await logSend(userId, invoice.id, recipient, providerId);
    // draft → sent only; re-sending an already-sent or paid invoice delivers
    // again but moves nothing.
    if (invoice.status === "draft") {
      await setInvoiceStatus(userId, invoiceId, "sent");
    }
  } catch (error) {
    console.error(
      `Invoice ${invoiceId} was emailed to ${recipient} (provider id ${providerId}) but recording it failed:`,
      error,
    );
  }

  return { ok: true, token, to: recipient };
}
