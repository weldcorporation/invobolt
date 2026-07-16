/**
 * Owner-scoped data access for recurring-invoice schedules (v0.3).
 *
 * Same rule as the other repositories: every statement here is scoped through
 * `ownedSchedules()` / `ownedSchedule()`, and `tenant-isolation.test.ts`
 * fails the build otherwise. The cron generator's cross-tenant scan lives in
 * `lib/recurring.ts` — deliberately not here, so this file stays uniformly
 * owner-scoped.
 */

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { firstIssueDateAfter, type Cadence } from "./cadence";
import { getDb, schema } from "./db";
import { isUuid } from "./uuid";
import type { Invoice } from "./types";

const { schedules } = schema;

/** Every schedule this user owns. */
export function ownedSchedules(userId: string) {
  return eq(schedules.userId, userId);
}

/** One schedule, but only if this user owns it. */
export function ownedSchedule(userId: string, id: string) {
  return and(eq(schedules.id, id), eq(schedules.userId, userId));
}

/** A row as the list view needs it — without the full template document. */
export interface ScheduleListItem {
  id: string;
  clientName: string | null;
  cadence: Cadence;
  nextIssueDate: string;
  paymentTermsDays: number;
  autoSend: boolean;
  active: boolean;
}

/** The user's schedules, soonest next invoice first. */
export async function listSchedules(
  userId: string,
): Promise<ScheduleListItem[]> {
  return getDb()
    .select({
      id: schedules.id,
      clientName: sql<
        string | null
      >`${schedules.document}->'client'->>'name'`,
      cadence: schedules.cadence,
      nextIssueDate: schedules.nextIssueDate,
      paymentTermsDays: schedules.paymentTermsDays,
      autoSend: schedules.autoSend,
      active: schedules.active,
    })
    .from(schedules)
    .where(ownedSchedules(userId))
    .orderBy(asc(schedules.nextIssueDate));
}

/**
 * Create a schedule from an invoice's current document.
 *
 * The first occurrence is strictly after `today` (see `firstIssueDateAfter`):
 * making an old invoice recurring must schedule the future, never backfill
 * the past. Callers pass the *server's* copy of the document — the schedule
 * template is account data, not whatever a client posted.
 */
export async function createSchedule(
  userId: string,
  document: Invoice,
  cadence: Cadence,
  paymentTermsDays: number,
  autoSend: boolean,
  today: string,
): Promise<string> {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(document.issueDate)
    ? document.issueDate
    : today;

  const [row] = await getDb()
    .insert(schedules)
    .values({
      userId,
      document,
      cadence,
      nextIssueDate: firstIssueDateAfter(anchor, cadence, today),
      paymentTermsDays,
      autoSend,
    })
    .returning({ id: schedules.id });

  return row.id;
}

/** Pause or resume a schedule the user owns. False if no such row is theirs. */
export async function setScheduleActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const updated = await getDb()
    .update(schedules)
    .set({ active, updatedAt: new Date() })
    .where(ownedSchedule(userId, id))
    .returning({ id: schedules.id });

  return updated.length > 0;
}

/** Delete a schedule. Invoices it already generated are untouched. */
export async function deleteSchedule(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const deleted = await getDb()
    .delete(schedules)
    .where(ownedSchedule(userId, id))
    .returning({ id: schedules.id });

  return deleted.length > 0;
}
