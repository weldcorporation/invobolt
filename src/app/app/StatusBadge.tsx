import type { InvoiceStatus } from "@/lib/db/schema";

/**
 * Read-only status pill.
 *
 * v0.2 step 3 only ever creates `draft` rows — transitions and the derived
 * `overdue` view arrive with status tracking (step 4). The badge renders every
 * stored status now so the list is already truthful once they do.
 */
const STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  sent: "bg-bolt-amber/15 text-bolt-amberDark",
  paid: "bg-paid/10 text-paid",
  void: "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-800",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
