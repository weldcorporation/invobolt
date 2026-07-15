/**
 * Pure helpers that bridge an `Invoice` document and its database row.
 *
 * Deliberately free of `server-only`, Drizzle, and Neon so this can be unit
 * tested in plain Node and imported from the client editor for pre-flight
 * validation. The actual queries live in `lib/invoices.ts`.
 *
 * The invoice document stays the source of truth: the lifted columns below are
 * always *derived* from it (never hand-edited), so a row can be rebuilt from
 * its `document` at any time. See `docs/workspace-mode-design.md`.
 */

import { computeTotals } from "./calc";
import type { Invoice } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cap on the logo data URL. Instant mode keeps logos small, but a workspace
 * write goes to Postgres, so bound it rather than trust the client.
 */
export const MAX_LOGO_CHARS = 512 * 1024;

/** The invoice total in minor units, for list views and sorting. */
export function invoiceTotalCents(invoice: Invoice): number {
  return Math.round(computeTotals(invoice).total * 100);
}

/** The columns lifted out of the document, as stored on the `invoices` row. */
export interface InvoiceColumns {
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  totalCents: number;
}

export function deriveInvoiceColumns(invoice: Invoice): InvoiceColumns {
  return {
    number: invoice.number.trim(),
    issueDate: invoice.issueDate,
    // `dueDate` is optional on the document but a nullable column in the DB.
    dueDate: invoice.dueDate ? invoice.dueDate : null,
    currency: invoice.currency,
    totalCents: invoiceTotalCents(invoice),
  };
}

/** `2026-001` — the shape the sample invoice uses. */
const NUMBERED = /^(\d{4})-(\d+)$/;

/**
 * The next free number for `year`, given the numbers a user already has.
 * Numbers that don't match the `YYYY-NNN` shape are ignored — the field is
 * user-editable, so free-form numbers must not break the sequence.
 */
export function nextInvoiceNumber(existing: string[], year: number): string {
  const prefix = String(year);
  let highest = 0;
  for (const candidate of existing) {
    const match = NUMBERED.exec(candidate.trim());
    if (!match || match[1] !== prefix) continue;
    highest = Math.max(highest, Number(match[2]));
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Problems that would make a write invalid, in user-facing English. Empty means
 * the invoice is safe to persist. This mirrors the NOT NULL columns — it is a
 * guard against writing a broken row, not a business-rule validator.
 */
export function validateInvoice(invoice: Invoice): string[] {
  const problems: string[] = [];

  if (!invoice.number.trim()) {
    problems.push("Invoice number is required.");
  }
  if (!ISO_DATE.test(invoice.issueDate)) {
    problems.push("Issue date is required.");
  }
  if (invoice.dueDate && !ISO_DATE.test(invoice.dueDate)) {
    problems.push("Due date must be a valid date.");
  }
  if (!invoice.currency.trim()) {
    problems.push("Currency is required.");
  }
  if (invoice.logoDataUrl && invoice.logoDataUrl.length > MAX_LOGO_CHARS) {
    problems.push("Logo is too large — use an image under 512 KB.");
  }

  return problems;
}
