"use server";

/**
 * Server Actions for Stripe import (v0.3).
 *
 * Preview and import are separate actions on purpose: the key is only needed
 * to *read* from Stripe, so it appears in the preview call and nowhere else —
 * the import call carries the rows the user selected, which are validated
 * like any other client-supplied data (the browser held them in the
 * meantime). The key itself is never stored and never logged; see lib/stripe.
 */

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { importStripeClient } from "@/lib/clients";
import { deleteItem, importStripeItem } from "@/lib/items";
import { isParty, validateClientParty } from "@/lib/party";
import {
  fetchStripeCustomers,
  fetchStripeProducts,
  isStripeCursor,
  isStripeKeyShape,
  serverStripeKey,
  type ImportedCustomer,
  type ImportedItem,
} from "@/lib/stripe";

/** One import writes at most this many rows — a paste-key UI is not an ETL. */
const MAX_IMPORT_ROWS = 500;

const CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;
const PRODUCT_ID = /^prod_[A-Za-z0-9]+$/;
const PRICE_ID = /^price_[A-Za-z0-9]+$/;
const CURRENCY = /^[A-Z]{3}$/;
/** Sanity bound for an imported unit price: one million in minor units × 100. */
const MAX_UNIT_PRICE_CENTS = 100_000_000;

export type StripePreview = {
  customers: ImportedCustomer[];
  items: ImportedItem[];
  /**
   * Where to resume, per list, when Stripe had more rows than one batch takes.
   * Null means that list is exhausted. Handing these back fetches the next
   * batch — the cap is a batch size, not a ceiling.
   */
  customersCursor: string | null;
  itemsCursor: string | null;
};

export type PreviewResult =
  | ({ ok: true } & StripePreview)
  | { ok: false; error: string };

/**
 * Read a batch of customers and products from Stripe with the pasted key (or
 * the self-hoster's env-configured one when the field is left empty). Reads
 * only; nothing is written until the user picks rows and confirms the import.
 *
 * The cursors round-trip through the browser, so they come back untrusted and
 * are shape-checked before they go anywhere near a Stripe URL.
 */
export async function previewStripeAction(
  key: unknown,
  cursors?: unknown,
): Promise<PreviewResult> {
  await requireUserId();

  if (typeof key !== "string") return { ok: false, error: "Paste a key." };

  const requested = (cursors ?? {}) as {
    customersAfter?: unknown;
    itemsAfter?: unknown;
  };
  const customersAfter = isStripeCursor(requested.customersAfter)
    ? requested.customersAfter
    : null;
  const itemsAfter = isStripeCursor(requested.itemsAfter)
    ? requested.itemsAfter
    : null;

  const pasted = key.trim();
  const resolved = pasted ? pasted : serverStripeKey();
  if (!resolved) {
    return { ok: false, error: "Paste a Stripe restricted key (rk_…)." };
  }
  if (!isStripeKeyShape(resolved)) {
    return {
      ok: false,
      error:
        "That isn't a restricted key. Create one under Developers → API keys → " +
        "Create restricted key, with read access to Customers and Products — " +
        "not your secret key.",
    };
  }

  try {
    const [customers, products] = await Promise.all([
      fetchStripeCustomers(resolved, customersAfter),
      fetchStripeProducts(resolved, itemsAfter),
    ]);
    return {
      ok: true,
      customers: customers.customers,
      items: products.items,
      customersCursor: customers.nextCursor,
      itemsCursor: products.nextCursor,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Stripe import failed.",
    };
  }
}

export type ImportResult =
  | { ok: true; imported: number; skipped: string[] }
  | { ok: false; error: string };

/**
 * Write the selected customers as saved clients. Everything is narrowed at
 * runtime: the rows took a round trip through the browser, so they are as
 * untrusted as anything else an action receives.
 */
export async function importStripeClientsAction(
  selection: unknown,
): Promise<ImportResult> {
  const userId = await requireUserId();

  if (!Array.isArray(selection) || selection.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  if (selection.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `Import at most ${MAX_IMPORT_ROWS} at a time.` };
  }

  // Validate everything before writing anything — a half-applied import that
  // stopped at row 37 is worse to explain than a clean rejection.
  const rows: { stripeCustomerId: string; party: ImportedCustomer["party"] }[] =
    [];
  for (const entry of selection) {
    const candidate = entry as {
      stripeCustomerId?: unknown;
      party?: unknown;
    } | null;
    if (
      typeof candidate?.stripeCustomerId !== "string" ||
      !CUSTOMER_ID.test(candidate.stripeCustomerId) ||
      !isParty(candidate.party) ||
      validateClientParty(candidate.party).length > 0
    ) {
      return { ok: false, error: "That selection doesn't look importable." };
    }
    rows.push({
      stripeCustomerId: candidate.stripeCustomerId,
      party: candidate.party,
    });
  }

  // Rows are written one at a time rather than in one transaction: the Neon
  // HTTP driver has no interactive transactions, and a batch cannot express
  // the per-row name/Stripe-id conflict resolution `importStripeClient` does.
  // A partial import is safe to leave: every write is an upsert keyed on the
  // Stripe id, so re-running finishes the job rather than duplicating it.
  let imported = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const outcome = await importStripeClient(
      userId,
      row.stripeCustomerId,
      row.party,
    );
    if (outcome === "imported") imported++;
    else skipped.push(row.party.name);
  }

  revalidatePath("/app/clients");
  revalidatePath("/app/import");
  return { ok: true, imported, skipped };
}

/** Write the selected products as saved items. Same narrowing discipline. */
export async function importStripeItemsAction(
  selection: unknown,
): Promise<ImportResult> {
  const userId = await requireUserId();

  if (!Array.isArray(selection) || selection.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  if (selection.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `Import at most ${MAX_IMPORT_ROWS} at a time.` };
  }

  const rows: ImportedItem[] = [];
  for (const entry of selection) {
    const c = entry as Partial<Record<keyof ImportedItem, unknown>> | null;
    if (
      typeof c?.stripeProductId !== "string" ||
      !PRODUCT_ID.test(c.stripeProductId) ||
      typeof c.stripePriceId !== "string" ||
      !PRICE_ID.test(c.stripePriceId) ||
      typeof c.description !== "string" ||
      !c.description.trim() ||
      c.description.length > 2000 ||
      typeof c.unitPriceCents !== "number" ||
      !Number.isInteger(c.unitPriceCents) ||
      c.unitPriceCents < 0 ||
      c.unitPriceCents > MAX_UNIT_PRICE_CENTS ||
      typeof c.currency !== "string" ||
      !CURRENCY.test(c.currency)
    ) {
      return { ok: false, error: "That selection doesn't look importable." };
    }
    rows.push({
      stripeProductId: c.stripeProductId,
      stripePriceId: c.stripePriceId,
      description: c.description.trim(),
      unitPriceCents: c.unitPriceCents,
      currency: c.currency,
    });
  }

  // Same one-at-a-time reasoning as the clients import above; the upsert is
  // keyed on the Stripe price id, so re-running is safe.
  for (const row of rows) {
    await importStripeItem(userId, row);
  }

  revalidatePath("/app/import");
  return { ok: true, imported: rows.length, skipped: [] };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Delete a saved item. Invoices already written keep their own line copy. */
export async function deleteItemAction(id: string): Promise<DeleteResult> {
  const userId = await requireUserId();

  const deleted = await deleteItem(userId, id);
  if (!deleted) return { ok: false, error: "That item no longer exists." };

  revalidatePath("/app/import");
  return { ok: true };
}
