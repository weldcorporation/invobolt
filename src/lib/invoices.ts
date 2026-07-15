/**
 * Owner-scoped data access for workspace invoices.
 *
 * **Tenant isolation is this module's one job.** Every statement below is
 * scoped through `ownedBy()` / `ownedInvoice()`; no function accepts a row id
 * without also taking the `userId` it must belong to, so an id guessed from a
 * URL can never reach another account's row. `tenant-isolation.test.ts` fails
 * the build if a query here is written without one of those scopes.
 */

import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { deriveInvoiceColumns, nextInvoiceNumber } from "./invoice-row";
import { emptyInvoice } from "./sample";
import { isUniqueViolation } from "./pg-errors";
import { sourcesFor, type InvoiceStatus } from "./status";
import { isUuid } from "./uuid";
import type { Invoice } from "./types";

const { invoices } = schema;

/** Every row this user owns. */
export function ownedBy(userId: string) {
  return eq(invoices.userId, userId);
}

/** One row, but only if this user owns it. */
export function ownedInvoice(userId: string, id: string) {
  return and(eq(invoices.id, id), eq(invoices.userId, userId));
}

/** A row as the list view needs it — deliberately without the full document. */
export interface InvoiceListItem {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  totalCents: number;
  clientName: string | null;
}

/**
 * The user's invoices, newest first. Pulls the client name out of the JSON
 * server-side rather than selecting `document`, so a list of invoices carrying
 * embedded logo data URLs stays a small query.
 */
export async function listInvoices(userId: string): Promise<InvoiceListItem[]> {
  return getDb()
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      clientName: sql<string | null>`${invoices.document}->'client'->>'name'`,
    })
    .from(invoices)
    .where(ownedBy(userId))
    .orderBy(desc(invoices.createdAt));
}

/** One invoice document, or null if it doesn't exist or isn't this user's. */
export async function getInvoice(
  userId: string,
  id: string,
): Promise<{ id: string; status: InvoiceStatus; document: Invoice } | null> {
  if (!isUuid(id)) return null;

  const rows = await getDb()
    .select({
      id: invoices.id,
      status: invoices.status,
      document: invoices.document,
    })
    .from(invoices)
    .where(ownedInvoice(userId, id))
    .limit(1);

  return rows[0] ?? null;
}

/** yyyy-mm-dd, `offsetDays` from now, in UTC so the server clock is stable. */
function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** The numbers already taken for `year`, used to pre-fill the next one. */
async function numbersInYear(userId: string, year: number): Promise<string[]> {
  const rows = await getDb()
    .select({ number: invoices.number })
    .from(invoices)
    .where(ownedBy(userId));

  const prefix = `${year}-`;
  return rows.map((r) => r.number).filter((n) => n.startsWith(prefix));
}

/**
 * Create a fresh draft and return its id.
 *
 * The number is pre-filled by reading the user's existing numbers, which races
 * with a concurrent create. Rather than lock, we let the unique index arbitrate
 * and retry — the loser simply re-reads and takes the next number.
 */
export async function createInvoice(userId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const base = emptyInvoice(isoDate(0), isoDate(14));

  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await numbersInYear(userId, year);
    const document: Invoice = {
      ...base,
      number: nextInvoiceNumber(taken, year),
    };

    try {
      const [row] = await getDb()
        .insert(invoices)
        .values({
          userId,
          status: "draft",
          document,
          ...deriveInvoiceColumns(document),
        })
        .returning({ id: invoices.id });
      return row.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Someone took that number between our read and our insert — try again.
    }
  }

  throw new Error(
    "Could not allocate an invoice number after several attempts. Please retry.",
  );
}

/**
 * Overwrite an invoice the user owns. Returns false when no such row exists for
 * them — the caller reports that rather than silently succeeding.
 *
 * Callers must validate the document first (see `validateInvoice`); this throws
 * on a duplicate number so the action layer can turn it into a message.
 */
export async function saveInvoice(
  userId: string,
  id: string,
  document: Invoice,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const updated = await getDb()
    .update(invoices)
    .set({
      document,
      ...deriveInvoiceColumns(document),
      updatedAt: new Date(),
    })
    .where(ownedInvoice(userId, id))
    .returning({ id: invoices.id });

  return updated.length > 0;
}

export type StatusChange = "ok" | "not-found" | "illegal";

/**
 * Move an invoice to `next`, if that transition is legal from where it is now.
 *
 * The legality check lives in the WHERE clause rather than in a read-then-write:
 * `status IN sourcesFor(next)` makes the whole thing one atomic statement, so
 * two tabs racing to mark the same invoice paid can't both observe `sent` and
 * both apply. The loser simply matches no rows.
 *
 * Only on failure do we spend a second query, to tell "you don't own this" apart
 * from "that move isn't allowed".
 */
export async function setInvoiceStatus(
  userId: string,
  id: string,
  next: InvoiceStatus,
): Promise<StatusChange> {
  if (!isUuid(id)) return "not-found";

  const moved = await getDb()
    .update(invoices)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(ownedInvoice(userId, id), inArray(invoices.status, sourcesFor(next))),
    )
    .returning({ id: invoices.id });

  if (moved.length > 0) return "ok";
  return (await getInvoice(userId, id)) ? "illegal" : "not-found";
}

/** Delete an invoice the user owns. Returns false if there was nothing to delete. */
export async function deleteInvoice(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const deleted = await getDb()
    .delete(invoices)
    .where(ownedInvoice(userId, id))
    .returning({ id: invoices.id });

  return deleted.length > 0;
}
