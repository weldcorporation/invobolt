/**
 * Owner-scoped data access for saved clients.
 *
 * Same rule as `invoices.ts`: every statement is scoped through
 * `ownedClients()` / `ownedClient()`, and no function takes a row id without
 * the `userId` it must belong to. `tenant-isolation.test.ts` fails the build if
 * a query here is written without one of those scopes.
 */

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { clientNameKey, normalizeParty } from "./party";
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
