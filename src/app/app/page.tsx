import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { requireUserId } from "@/lib/session";
import { listInvoices } from "@/lib/invoices";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { groupByDisplayStatus, todayIso } from "@/lib/status";
import { createInvoiceAction } from "./actions";
import { SignOutButton } from "./SignOutButton";
import { StatusBadge } from "./StatusBadge";

export const dynamic = "force-dynamic";

/**
 * Workspace home: the user's saved invoices, grouped by status. The layout has
 * gated on the feature flag and the proxy on the session; `requireUserId`
 * re-derives the owner so the query below can be scoped to it.
 */
export default async function WorkspaceHome() {
  const userId = await requireUserId();
  const [invoices, { data: session }] = await Promise.all([
    listInvoices(userId),
    getAuth().getSession(),
  ]);
  const email = session?.user?.email ?? "your account";
  // `overdue` is derived here, on every read, rather than stored — so a date
  // rolling over can never leave a row claiming a status that isn't true.
  const groups = groupByDisplayStatus(invoices, todayIso());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your invoices</h1>
          <p className="text-sm text-neutral-500">Signed in as {email}</p>
        </div>
        <div className="flex items-center gap-2">
          <SignOutButton />
          <form action={createInvoiceAction}>
            <button
              type="submit"
              className="rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
            >
              ⚡ New invoice
            </button>
          </form>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No invoices yet. Create one to get started — or generate a one-off
          without saving it on the{" "}
          <Link href="/" className="font-medium text-bolt-amberDark underline">
            home page
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Issued</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>

            {/* One tbody per group: the status lives in the group header, so the
                rows don't repeat it, and the columns stay aligned throughout. */}
            {groups.map((group) => (
              <tbody
                key={group.status}
                className="divide-y divide-neutral-200 dark:divide-neutral-800"
              >
                <tr className="border-t border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40">
                  <th colSpan={5} className="px-4 py-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <StatusBadge status={group.status} />
                      <span className="text-xs text-neutral-400">
                        {group.items.length}
                      </span>
                    </span>
                  </th>
                </tr>

                {group.items.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/app/invoices/${invoice.id}`}
                        className="hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {invoice.clientName || (
                        <span className="text-neutral-400">No client yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatDate(invoice.issueDate, "en")}
                    </td>
                    <td
                      className={`px-4 py-3 ${
                        group.status === "overdue"
                          ? "font-medium text-overdue"
                          : "text-neutral-500"
                      }`}
                    >
                      {invoice.dueDate ? (
                        formatDate(invoice.dueDate, "en")
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatMoney(invoice.totalCents / 100, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
