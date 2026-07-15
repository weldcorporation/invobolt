/**
 * Owner-scoped data access for the account's business profile.
 *
 * Same rule as the other repositories: every statement is scoped through
 * `ownedProfile()`, and no function reaches a row without the `userId` it
 * belongs to. `tenant-isolation.test.ts` fails the build otherwise.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { normalizeBusinessProfile } from "./profile";
import type { BusinessProfile } from "./types";

const { profiles } = schema;

/** This user's profile row. `user_id` is the primary key: there is at most one. */
export function ownedProfile(userId: string) {
  return eq(profiles.userId, userId);
}

/** The user's saved defaults, or null if they've never imported or saved any. */
export async function getProfile(
  userId: string,
): Promise<BusinessProfile | null> {
  const rows = await getDb()
    .select({ profile: profiles.profile })
    .from(profiles)
    .where(ownedProfile(userId))
    .limit(1);

  return rows[0]?.profile ?? null;
}

/**
 * Store the user's defaults, replacing any they already had.
 *
 * One atomic upsert on the primary key — no read-then-write, so the import and
 * a "save as default" racing each other can't produce two rows or lose one.
 *
 * Callers must validate first (see `validateBusinessProfile`).
 */
export async function upsertProfile(
  userId: string,
  profile: BusinessProfile,
): Promise<BusinessProfile> {
  const normalized = normalizeBusinessProfile(profile);

  const [row] = await getDb()
    .insert(profiles)
    .values({ userId, profile: normalized })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { profile: normalized, updatedAt: new Date() },
    })
    .returning({ profile: profiles.profile });

  return row.profile;
}
