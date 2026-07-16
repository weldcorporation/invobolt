/**
 * The recurring-invoice generator (v0.3) — the system actor behind
 * `/api/cron/recurring`.
 *
 * **This module is the deliberate exception to per-user scoping.** It runs on
 * behalf of the system, not a session: the due-schedule scan crosses tenants
 * by design, and every row it touches carries its own `user_id`, which is
 * what each generated invoice (and its auto-send) is scoped to.
 * `tenant-isolation.test.ts` names the exception explicitly.
 *
 * Concurrency is settled by an atomic claim, the same trick the status
 * machine uses: advancing `next_issue_date` happens in the UPDATE's WHERE
 * clause, so of two overlapping cron runs exactly one claims a given period.
 * There is no transaction around claim + insert — the Neon HTTP driver runs
 * single statements — so a crash between the two loses one period rather
 * than double-billing it, and the compensation below narrows even that
 * window. Losing a period is recoverable by hand; a duplicate invoice sent
 * to a client is not.
 */

import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { addDays, advanceDate } from "./cadence";
import { getDb, schema } from "./db";
import { isEmailEnabled } from "./email";
import { insertInvoiceWithFreshNumber } from "./invoices";
import { sendInvoiceEmailFlow } from "./send-invoice";
import type { Invoice } from "./types";

const { schedules } = schema;

/** How many schedules one run processes — a backstop, not a target. */
const BATCH = 200;

/** Schedules whose period has arrived: active, next issue date ≤ today. */
export function dueSchedules(today: string) {
  return and(eq(schedules.active, true), lte(schedules.nextIssueDate, today));
}

/**
 * The claim: this exact schedule, still at the date we read, still active.
 * An UPDATE guarded by this matches zero rows when a concurrent run (or the
 * owner pausing the schedule) got there first.
 */
export function scheduleClaim(id: string, expectedNextIssueDate: string) {
  return and(
    eq(schedules.id, id),
    eq(schedules.nextIssueDate, expectedNextIssueDate),
    eq(schedules.active, true),
  );
}

export interface GenerationSummary {
  generated: number;
  sent: number;
  failures: number;
}

/**
 * Generate every invoice that is due as of `today`.
 *
 * Catch-up is the outer loop: a schedule that missed days (the cron doesn't
 * run, the site was down) is claimed once per missed period, each generated
 * invoice dated to *its* period, until the next date is in the future. Each
 * pass re-reads the due set, so the claims stay atomic per period.
 *
 * `origin` is the deployment's public address (for share links in auto-send
 * emails); without one, generation still runs and auto-send is skipped.
 */
export async function generateDueInvoices(
  today: string,
  origin: string | null,
): Promise<GenerationSummary> {
  const summary: GenerationSummary = { generated: 0, sent: 0, failures: 0 };
  const canSend = isEmailEnabled() && origin !== null;

  // Each outer pass handles one period per due schedule; a schedule that is
  // three months behind resolves in three passes. The pass cap bounds a
  // pathological backlog without ever spinning on the same rows.
  for (let pass = 0; pass < 24; pass++) {
    const due = await getDb()
      .select({
        id: schedules.id,
        userId: schedules.userId,
        document: schedules.document,
        cadence: schedules.cadence,
        nextIssueDate: schedules.nextIssueDate,
        paymentTermsDays: schedules.paymentTermsDays,
        autoSend: schedules.autoSend,
      })
      .from(schedules)
      .where(dueSchedules(today))
      .limit(BATCH);

    if (due.length === 0) break;

    for (const schedule of due) {
      const advanced = advanceDate(schedule.nextIssueDate, schedule.cadence);

      const claimed = await getDb()
        .update(schedules)
        .set({ nextIssueDate: advanced, updatedAt: new Date() })
        .where(scheduleClaim(schedule.id, schedule.nextIssueDate))
        .returning({ id: schedules.id });
      if (claimed.length === 0) continue; // another run (or a pause) won

      const issueDate = schedule.nextIssueDate;
      const base: Invoice = {
        ...schedule.document,
        issueDate,
        dueDate: addDays(issueDate, schedule.paymentTermsDays),
      };

      let invoiceId: string;
      try {
        invoiceId = await insertInvoiceWithFreshNumber(schedule.userId, base);
      } catch (error) {
        console.error(
          `Recurring generation failed for schedule ${schedule.id}:`,
          error,
        );
        summary.failures++;
        // Best-effort compensation: put the claim back so the period is
        // retried next run instead of silently skipped. Guarded on the
        // advanced value so a run that raced us is never rewound.
        //
        // Best-effort means it gets its own catch. This runs *because* a write
        // just failed, so the database is exactly where a second failure is
        // plausible — and an unguarded throw here would escape the per-schedule
        // boundary and abandon every other due schedule in the run over one bad
        // row. Losing this period is the lesser failure, and it is logged.
        try {
          await getDb()
            .update(schedules)
            .set({ nextIssueDate: issueDate, updatedAt: new Date() })
            .where(scheduleClaim(schedule.id, advanced));
        } catch (rewindError) {
          console.error(
            `Rewind failed for schedule ${schedule.id}; the ${issueDate} period is skipped:`,
            rewindError,
          );
        }
        continue;
      }
      summary.generated++;

      if (schedule.autoSend && canSend) {
        // A failed send leaves a draft — the owner sees it on /app and can
        // send by hand. Never a reason to fail the generation.
        try {
          const outcome = await sendInvoiceEmailFlow(
            schedule.userId,
            invoiceId,
            schedule.document.client.email,
            origin,
          );
          if (outcome.ok) summary.sent++;
          else {
            console.error(
              `Auto-send skipped for schedule ${schedule.id}: ${outcome.error}`,
            );
            summary.failures++;
          }
        } catch (error) {
          console.error(`Auto-send failed for schedule ${schedule.id}:`, error);
          summary.failures++;
        }
      }
    }
  }

  return summary;
}
