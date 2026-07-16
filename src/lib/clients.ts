/**
 * Owner-scoped data access for saved clients.
 *
 * Same rule as `invoices.ts`: every statement is scoped through
 * `ownedClients()` / `ownedClient()`, and no function takes a row id without
 * the `userId` it must belong to. `tenant-isolation.test.ts` fails the build if
 * a query here is written without one of those scopes.
 */

import "server-only";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { clientNameKey, normalizeParty } from "./party";
import { isUniqueViolation } from "./pg-errors";
import { isUuid } from "./uuid";
import type { Party } from "./types";

const { clients } = schema;

/** Every saved client this user owns. */
export function ownedClients(userId: string) {
  return eq(clients.userId, userId);
}

/** One saved client, but only if this user owns it. */
export function ownedClient(userId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.userId, userId));
}

export interface SavedClient {
  id: string;
  name: string;
  party: Party;
}

/** The user's saved clients, A–Z — the order a picker wants them in. */
export async function listClients(userId: string): Promise<SavedClient[]> {
  return getDb()
    .select({ id: clients.id, name: clients.name, party: clients.party })
    .from(clients)
    .where(ownedClients(userId))
    .orderBy(asc(clients.name));
}

/**
 * Save a client, replacing any the user already has under that name.
 *
 * The dedup key is the `(user_id, lower(name))` unique index, so this is one
 * atomic statement: `ON CONFLICT` lets Postgres decide insert-or-update. Doing
 * it in app code — look up the name, then insert or update — would be a
 * read-then-write race, and losing that race means a duplicate Acme rather than
 * a clean error.
 *
 * Callers must validate first (see `validateClientParty`); a blank name would
 * violate the NOT NULL column.
 */
export async function upsertClient(
  userId: string,
  party: Party,
): Promise<SavedClient> {
  const normalized = normalizeParty(party);

  const [row] = await getDb()
    .insert(clients)
    .values({
      userId,
      name: normalized.name,
      nameKey: clientNameKey(normalized.name),
      party: normalized,
    })
    .onConflictDoUpdate({
      target: [clients.userId, clients.nameKey],
      set: {
        // Re-set the name so saving "acme corp" over "Acme Corp" adopts the new
        // capitalisation rather than silently keeping the old spelling.
        name: normalized.name,
        party: normalized,
        updatedAt: new Date(),
      },
    })
    .returning({ id: clients.id, name: clients.name, party: clients.party });

  return row;
}

/**
 * What became of one imported Stripe customer. `name-taken` means the user
 * already has a *different* client under that name — the caller reports it
 * rather than guessing which one was meant.
 */
export type ClientImportOutcome = "imported" | "name-taken";

/**
 * Import one Stripe customer as a saved client (v0.3).
 *
 * The upsert is keyed on the *Stripe id* (the partial unique index), so
 * re-importing after a rename in Stripe updates the same client in place —
 * a name-keyed upsert would resurrect the old name as a second row.
 *
 * Two unique indexes cover this table, and a single statement can only name
 * one as its conflict target, so the *name* index arrives as a thrown
 * violation. Two different things throw it:
 *
 *   - the insert, when this user already has a client under this name;
 *   - the ON CONFLICT DO UPDATE itself, when a customer renamed in Stripe
 *     renames its row onto a name another row already holds.
 *
 * Either way the recovery is the same, and its `WHERE` is the whole point: we
 * adopt the name-holder **only if it isn't already another Stripe customer's
 * row**. Attaching this id to that row would silently re-point that customer's
 * client at this one — a corruption that would then ping-pong on every
 * re-import as each customer stole the name back. Two Stripe customers cannot
 * share one name here; the unique index says so, and saying "skipped" is the
 * honest answer.
 *
 * Callers validate the party first, like every other write.
 */
export async function importStripeClient(
  userId: string,
  stripeCustomerId: string,
  party: Party,
): Promise<ClientImportOutcome> {
  const normalized = normalizeParty(party);
  const nameKey = clientNameKey(normalized.name);

  try {
    await getDb()
      .insert(clients)
      .values({
        userId,
        name: normalized.name,
        nameKey,
        party: normalized,
        stripeCustomerId,
      })
      .onConflictDoUpdate({
        target: [clients.userId, clients.stripeCustomerId],
        targetWhere: sql`stripe_customer_id is not null`,
        set: {
          name: normalized.name,
          nameKey,
          party: normalized,
          updatedAt: new Date(),
        },
      });
    return "imported";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  try {
    const adopted = await getDb()
      .update(clients)
      .set({ stripeCustomerId, party: normalized, updatedAt: new Date() })
      .where(
        and(
          ownedClients(userId),
          eq(clients.nameKey, nameKey),
          // Unlinked (saved by hand) or already ours. The guard lives in the
          // WHERE so the check and the write are one atomic statement.
          or(
            isNull(clients.stripeCustomerId),
            eq(clients.stripeCustomerId, stripeCustomerId),
          ),
        ),
      )
      .returning({ id: clients.id });

    return adopted.length > 0 ? "imported" : "name-taken";
  } catch (error) {
    // The name-holder was adoptable, but taking the name would leave this
    // Stripe id on two rows — our own earlier row still holds it. Same
    // ambiguity, same answer.
    if (!isUniqueViolation(error)) throw error;
    return "name-taken";
  }
}

/**
 * Update a specific saved client the user owns. False if no such row is theirs.
 *
 * Distinct from `upsertClient` on purpose. Upsert is keyed by *name*, which is
 * right when saving a bill-to that may or may not already be a client — but
 * wrong for editing, where renaming Acme to Acme Ltd would insert a second row
 * and orphan the first. Here we know exactly which row is meant, so we address
 * it by id and let the unique index reject a rename that collides.
 *
 * Callers must validate first (see `validateClientParty`); this throws on a
 * name collision so the action layer can turn it into a message.
 */
export async function updateClient(
  userId: string,
  id: string,
  party: Party,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const normalized = normalizeParty(party);

  const updated = await getDb()
    .update(clients)
    .set({
      name: normalized.name,
      nameKey: clientNameKey(normalized.name),
      party: normalized,
      updatedAt: new Date(),
    })
    .where(ownedClient(userId, id))
    .returning({ id: clients.id });

  return updated.length > 0;
}

/** Delete a saved client the user owns. False if there was nothing to delete. */
export async function deleteClient(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const deleted = await getDb()
    .delete(clients)
    .where(ownedClient(userId, id))
    .returning({ id: clients.id });

  return deleted.length > 0;
}
