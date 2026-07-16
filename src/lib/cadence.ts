/**
 * Recurring-invoice cadence (v0.3): pure date arithmetic, no clock.
 *
 * Everything takes dates as `yyyy-mm-dd` strings and returns the same, so the
 * rules are unit-testable and the cron route stays the only place that reads
 * the clock. Weekly is deliberately absent — invoicing cadences are monthly
 * and up; a rarely-wanted option is UI noise and another branch to test.
 */

export type Cadence = "monthly" | "quarterly" | "yearly";

export const CADENCES: readonly Cadence[] = ["monthly", "quarterly", "yearly"];

const CADENCE_MONTHS: Record<Cadence, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Narrow untrusted input — the cadence arrives through a public action. */
export function isCadence(value: unknown): value is Cadence {
  return (
    typeof value === "string" && (CADENCES as readonly string[]).includes(value)
  );
}

export function cadenceLabel(cadence: Cadence): string {
  switch (cadence) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    default:
      return "Yearly";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The same date one cadence later, clamping the day into the target month —
 * Jan 31 + monthly is Feb 28/29. The clamp is sticky: once a schedule lands
 * on the 28th it stays there rather than springing back to the 31st, which is
 * a known, documented simplification (no anchor day is stored).
 */
export function advanceDate(iso: string, cadence: Cadence): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + CADENCE_MONTHS[cadence];
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  // Day 0 of the *next* month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/**
 * Where a new schedule starts: the first occurrence strictly after `today`.
 *
 * Advancing from the source invoice's issue date keeps the day-of-month the
 * user actually invoices on; skipping everything up to and including today is
 * what makes "make this recurring" safe on an old invoice — past periods were
 * presumably invoiced by hand, and a schedule must never flood the account
 * with backdated drafts the moment it is created.
 */
export function firstIssueDateAfter(
  issueDate: string,
  cadence: Cadence,
  today: string,
): string {
  // ISO dates compare correctly as strings.
  let next = issueDate;
  do {
    next = advanceDate(next, cadence);
  } while (next <= today);
  return next;
}

/** `iso` plus `days`, in UTC — how a generated invoice gets its due date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
