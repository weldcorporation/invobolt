/**
 * The invoice status state machine.
 *
 * `InvoiceStatus` lives here rather than in `db/schema.ts` so the editor and
 * the badge can import it without pulling Drizzle into the client bundle; the
 * schema imports it back for its `$type<>()` annotation. Everything here is
 * pure and takes `today` as an argument, so the derived-overdue rule is
 * testable without mocking the clock.
 */

/** What is actually stored in the `status` column. */
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

/**
 * What the UI shows. `overdue` is deliberately absent from `InvoiceStatus`:
 * it is a *view* of `sent` past its due date, recomputed on every read, so a
 * date rolling over can never leave a stored value stale.
 */
export type DisplayStatus = InvoiceStatus | "overdue";

/**
 * Which statuses each status may move to.
 *
 * The forward path is `draft → sent → paid`, with `void` reachable from any
 * live status. The backward edges exist because the forward ones are a single
 * click and people mis-click: `sent → draft` un-sends, `paid → sent` un-pays,
 * and `void → draft` restores. Nothing may transition to itself.
 */
export const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["paid", "draft", "void"],
  paid: ["sent", "void"],
  void: ["draft"],
};

export const STATUSES = Object.keys(TRANSITIONS) as InvoiceStatus[];

/** Order the list groups appear in: what needs attention first. */
export const DISPLAY_ORDER: readonly DisplayStatus[] = [
  "overdue",
  "draft",
  "sent",
  "paid",
  "void",
];

/**
 * Narrow untrusted input. Server Actions are public endpoints and TypeScript
 * types are erased at runtime, so a status arriving from the client is just an
 * unknown string until this says otherwise.
 */
export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return (
    typeof value === "string" && (STATUSES as readonly string[]).includes(value)
  );
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The statuses a row must currently be in for a move to `to` to be legal.
 *
 * This is the inverse of `TRANSITIONS`, and it lets the repository push the
 * rule into the UPDATE's WHERE clause instead of reading the row first —
 * making the check atomic rather than a read-modify-write race.
 */
export function sourcesFor(to: InvoiceStatus): InvoiceStatus[] {
  return STATUSES.filter((from) => canTransition(from, to));
}

/**
 * The status to show for a row. An invoice is overdue when it has been sent
 * and its due date has *passed* — due today is not yet overdue.
 *
 * `today` is the caller's yyyy-mm-dd; ISO dates compare correctly as strings.
 */
export function displayStatus(
  status: InvoiceStatus,
  dueDate: string | null,
  today: string,
): DisplayStatus {
  if (status === "sent" && dueDate && dueDate < today) return "overdue";
  return status;
}

/**
 * Bucket rows by what the UI shows, in `DISPLAY_ORDER`, dropping empty groups.
 *
 * Generic over the row so it stays here with the rule it applies rather than in
 * the page: the list only needs `status` and `dueDate` to know where a row goes.
 */
export function groupByDisplayStatus<
  T extends { status: InvoiceStatus; dueDate: string | null },
>(
  items: readonly T[],
  today: string,
): { status: DisplayStatus; items: T[] }[] {
  return DISPLAY_ORDER.map((status) => ({
    status,
    items: items.filter(
      (item) => displayStatus(item.status, item.dueDate, today) === status,
    ),
  })).filter((group) => group.items.length > 0);
}

/** The button label for a move, which reads differently depending on where you are. */
export function transitionLabel(
  from: InvoiceStatus,
  to: InvoiceStatus,
): string {
  if (to === "draft") return from === "void" ? "Restore" : "Back to draft";
  if (to === "sent") return from === "paid" ? "Mark as unpaid" : "Mark as sent";
  if (to === "paid") return "Mark as paid";
  return "Void";
}

/**
 * Today as yyyy-mm-dd, in UTC.
 *
 * The one impure function here, kept beside the rule it feeds. UTC means a due
 * date flips to overdue on the UTC day boundary rather than the viewer's — off
 * by at most a few hours for a status that is advisory, and in exchange the
 * server and every client agree on what "today" is.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
