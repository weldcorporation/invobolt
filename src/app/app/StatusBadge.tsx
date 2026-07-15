import type { DisplayStatus } from "@/lib/status";

/**
 * Status pill. Takes a `DisplayStatus`, so it renders the derived `overdue`
 * view as well as the four stored statuses — `paid` and `overdue` reuse the
 * theme tokens that already exist for them.
 */
const STYLES: Record<DisplayStatus, string> = {
  draft:
    "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  sent: "bg-bolt-amber/15 text-bolt-amberDark",
  overdue: "bg-overdue/10 text-overdue",
  paid: "bg-paid/10 text-paid",
  void: "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-800",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
