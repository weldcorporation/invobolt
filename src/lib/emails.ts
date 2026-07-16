/**
 * Owner-scoped data access for the invoice-email log.
 *
 * Same rule as the other repositories: every statement is scoped through
 * `ownedEmails()`, and `tenant-isolation.test.ts` fails the build if a query
 * here is written without it. Rows are append-only — the log is an audit
 * trail and the rate-limit counter, and neither may be edited after the fact.
 */

import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb, schema } from "./db";

const { invoiceEmails } = schema;

/** Every send this user made. */
export function ownedEmails(userId: string) {
  return eq(invoiceEmails.userId, userId);
}

/**
 * How many emails this user has sent since `since`. This count *is* the rate
 * limiter (see `dailyEmailCap`): checked before a send, so two racing sends
 * can each pass at cap-minus-one — the cap is anti-abuse, not accounting, and
 * being off by one under a deliberate race is fine.
 */
export async function countSendsSince(
  userId: string,
  since: Date,
): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(invoiceEmails)
    .where(and(ownedEmails(userId), gte(invoiceEmails.sentAt, since)));

  return rows[0]?.value ?? 0;
}

/** Record a send that the provider accepted. */
export async function logSend(
  userId: string,
  invoiceId: string,
  toEmail: string,
  providerId: string | null,
): Promise<void> {
  await getDb()
    .insert(invoiceEmails)
    .values({ userId, invoiceId, toEmail, providerId });
}
