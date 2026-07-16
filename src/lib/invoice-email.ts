/**
 * The invoice email itself: subject and plain-text body.
 *
 * Pure and dependency-free (no `server-only`, no transport) so the exact
 * words a client receives are unit-testable. The body is deliberately
 * minimal — number, amount, due date, the share link — because the full
 * invoice lives *behind* the link, revocable, rather than at rest in two
 * mail providers' archives. Plain text on purpose: no tracking pixels, no
 * HTML template to drift from the real document.
 *
 * Copy follows `invoice.locale`, like everything printed for the recipient.
 */

import { computeTotals } from "./calc";
import { formatMoney } from "./currency";
import { formatDate } from "./format";
import type { Invoice, Locale } from "./types";

/** Practical upper bound from RFC 5321; anything longer is not an address. */
const MAX_EMAIL_CHARS = 320;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether a string is plausibly a deliverable address. A shape check, not an
 * RFC parser — the provider is the real arbiter; this keeps obvious junk (and
 * header-injection attempts, which need whitespace) out of the send.
 */
export function isEmailAddress(value: string): boolean {
  return value.length <= MAX_EMAIL_CHARS && EMAIL_SHAPE.test(value);
}

interface EmailStrings {
  subject: (number: string, seller: string) => string;
  intro: (number: string, seller: string) => string;
  amountDue: string;
  dueDate: string;
  view: string;
  pay: string;
  footer: string;
}

const STRINGS: Record<Locale, EmailStrings> = {
  en: {
    subject: (number, seller) =>
      seller ? `Invoice ${number} from ${seller}` : `Invoice ${number}`,
    intro: (number, seller) =>
      seller
        ? `${seller} sent you invoice ${number}.`
        : `You received invoice ${number}.`,
    amountDue: "Amount due",
    dueDate: "Due date",
    view: "View and download the invoice:",
    pay: "Pay online:",
    footer: "Sent with Invobolt.",
  },
  nl: {
    subject: (number, seller) =>
      seller ? `Factuur ${number} van ${seller}` : `Factuur ${number}`,
    intro: (number, seller) =>
      seller
        ? `${seller} heeft je factuur ${number} gestuurd.`
        : `Je hebt factuur ${number} ontvangen.`,
    amountDue: "Te betalen",
    dueDate: "Vervaldatum",
    view: "Bekijk en download de factuur:",
    pay: "Online betalen:",
    footer: "Verstuurd met Invobolt.",
  },
};

export interface InvoiceEmail {
  subject: string;
  text: string;
}

/**
 * Build the email for an invoice. `shareUrl` is the absolute `/i/[token]`
 * link; `paymentLinkUrl` adds a pay section when the sender has set one.
 */
export function buildInvoiceEmail(
  invoice: Invoice,
  shareUrl: string,
  paymentLinkUrl: string | null,
): InvoiceEmail {
  const s = STRINGS[invoice.locale] ?? STRINGS.en;
  const number = invoice.number.trim();
  const seller = invoice.seller.name.trim();
  const amount = formatMoney(
    computeTotals(invoice).total,
    invoice.currency,
    invoice.locale,
  );

  const lines = [s.intro(number, seller), ""];
  lines.push(`${s.amountDue}: ${amount}`);
  if (invoice.dueDate) {
    lines.push(`${s.dueDate}: ${formatDate(invoice.dueDate, invoice.locale)}`);
  }
  lines.push("", s.view, shareUrl);
  if (paymentLinkUrl) {
    lines.push("", s.pay, paymentLinkUrl);
  }
  lines.push("", "--", s.footer);

  return { subject: s.subject(number, seller), text: lines.join("\n") };
}
