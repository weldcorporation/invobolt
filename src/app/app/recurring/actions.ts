"use server";

/**
 * Server Actions for recurring schedules (v0.3). Same discipline as the rest:
 * each re-derives the user from the session, and every client-supplied value
 * is narrowed at runtime before it goes anywhere near a row.
 */

import { revalidatePath } from "next/cache";
import { isCadence } from "@/lib/cadence";
import { isEmailEnabled } from "@/lib/email";
import { getInvoice } from "@/lib/invoices";
import { isUniqueViolation } from "@/lib/pg-errors";
import {
  createSchedule,
  deleteSchedule,
  setScheduleActive,
} from "@/lib/schedules";
import { requireUserId } from "@/lib/session";
import { todayIso } from "@/lib/status";

export type ScheduleResult = { ok: true } | { ok: false; error: string };

/** Payment terms live between "due on receipt" and a year — anything else is a typo. */
const MAX_TERMS_DAYS = 365;

/**
 * Turn an invoice into a schedule. The template document is the *server's*
 * copy of the invoice, fetched here — not a document posted by the client —
 * so a schedule can only ever templatize data the account already has.
 */
export async function makeRecurringAction(
  invoiceId: string,
  cadence: unknown,
  paymentTermsDays: unknown,
  autoSend: unknown,
): Promise<ScheduleResult> {
  const userId = await requireUserId();

  if (!isCadence(cadence)) return { ok: false, error: "Unknown cadence." };
  if (
    typeof paymentTermsDays !== "number" ||
    !Number.isInteger(paymentTermsDays) ||
    paymentTermsDays < 0 ||
    paymentTermsDays > MAX_TERMS_DAYS
  ) {
    return {
      ok: false,
      error: `Payment terms must be 0–${MAX_TERMS_DAYS} days.`,
    };
  }
  // Auto-send without working email would generate drafts that claim to have
  // been sent to no one; refuse the combination outright.
  const send = autoSend === true;
  if (send && !isEmailEnabled()) {
    return { ok: false, error: "Email delivery isn't configured here." };
  }

  const invoice = await getInvoice(userId, invoiceId);
  if (!invoice) return { ok: false, error: "This invoice no longer exists." };

  try {
    await createSchedule(
      userId,
      invoice.id,
      invoice.document,
      cadence,
      paymentTermsDays,
      send,
      todayIso(),
    );
  } catch (error) {
    // The unique index arbitrates: this invoice already has a schedule. A
    // second one would generate — and with auto-send, email — a duplicate
    // invoice every period, which is why this is refused rather than merged.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error:
          "This invoice already has a schedule. Manage it under Recurring.",
      };
    }
    throw error;
  }

  revalidatePath("/app/recurring");
  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true };
}

/** Pause or resume a schedule. Paused schedules generate nothing, ever. */
export async function setScheduleActiveAction(
  id: string,
  active: unknown,
): Promise<ScheduleResult> {
  const userId = await requireUserId();

  const changed = await setScheduleActive(userId, id, active === true);
  if (!changed) return { ok: false, error: "That schedule no longer exists." };

  revalidatePath("/app/recurring");
  return { ok: true };
}

/** Delete a schedule. Invoices it already generated are untouched. */
export async function deleteScheduleAction(id: string): Promise<ScheduleResult> {
  const userId = await requireUserId();

  const deleted = await deleteSchedule(userId, id);
  if (!deleted) return { ok: false, error: "That schedule no longer exists." };

  revalidatePath("/app/recurring");
  return { ok: true };
}
