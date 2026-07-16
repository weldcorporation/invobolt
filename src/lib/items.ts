/**
 * Owner-scoped data access for saved line items (v0.3).
 *
 * Same rule as the other repositories: every statement is scoped through
 * `ownedItems()` / `ownedItem()`, and `tenant-isolation.test.ts` fails the
 * build if a query here is written without one of those scopes.
 */

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { ImportedItem } from "./stripe";
import { isUuid } from "./uuid";

const { items } = schema;

/** Every saved item this user owns. */
export function ownedItems(userId: string) {
  return eq(items.userId, userId);
}

/** One saved item, but only if this user owns it. */
export function ownedItem(userId: string, id: string) {
  return and(eq(items.id, id), eq(items.userId, userId));
}

export interface SavedItem {
  id: string;
  description: string;
  unitPriceCents: number;
  currency: string;
  vatRate: number | null;
}

/** The user's saved items, A–Z — the order a picker wants them in. */
export async function listItems(userId: string): Promise<SavedItem[]> {
  return getDb()
    .select({
      id: items.id,
      description: items.description,
      unitPriceCents: items.unitPriceCents,
      currency: items.currency,
      vatRate: items.vatRate,
    })
    .from(items)
    .where(ownedItems(userId))
    .orderBy(asc(items.description));
}

/**
 * Import one Stripe product as a saved item. Keyed on the *price* id (the
 * partial unique index), so re-importing is idempotent: the same price
 * updates in place, while a product whose price changed in Stripe — a new
 * price object — lands as a new item.
 */
export async function importStripeItem(
  userId: string,
  imported: ImportedItem,
): Promise<void> {
  await getDb()
    .insert(items)
    .values({
      userId,
      description: imported.description,
      unitPriceCents: imported.unitPriceCents,
      currency: imported.currency,
      stripeProductId: imported.stripeProductId,
      stripePriceId: imported.stripePriceId,
    })
    .onConflictDoUpdate({
      target: [items.userId, items.stripePriceId],
      targetWhere: sql`stripe_price_id is not null`,
      set: {
        description: imported.description,
        unitPriceCents: imported.unitPriceCents,
        currency: imported.currency,
        stripeProductId: imported.stripeProductId,
        updatedAt: new Date(),
      },
    });
}

/** Delete a saved item the user owns. False if there was nothing to delete. */
export async function deleteItem(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const deleted = await getDb()
    .delete(items)
    .where(ownedItem(userId, id))
    .returning({ id: items.id });

  return deleted.length > 0;
}
