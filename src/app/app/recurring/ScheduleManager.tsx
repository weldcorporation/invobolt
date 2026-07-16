"use client";

import { useState } from "react";
import Link from "next/link";
import { cadenceLabel } from "@/lib/cadence";
import { formatDate } from "@/lib/format";
import type { ScheduleListItem } from "@/lib/schedules";
import { deleteScheduleAction, setScheduleActiveAction } from "./actions";

/**
 * The schedules list. The rows come from the server component and refresh
 * themselves: each action revalidates `/app/recurring`, which re-renders this
 * component with new props (same pattern as ClientManager).
 */
export function ScheduleManager({
  schedules,
}: {
  schedules: ScheduleListItem[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onToggle = async (schedule: ScheduleListItem) => {
    setBusyId(schedule.id);
    setError(null);
    try {
      const result = await setScheduleActiveAction(
        schedule.id,
        !schedule.active,
      );
      if (!result.ok) setError(result.error);
    } catch {
      setError("Couldn't reach the server — the schedule is unchanged.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (schedule: ScheduleListItem) => {
    if (
      !window.confirm(
        "Delete this schedule? Invoices it already generated are kept.",
      )
    ) {
      return;
    }
    setBusyId(schedule.id);
    setError(null);
    try {
      const result = await deleteScheduleAction(schedule.id);
      if (!result.ok) setError(result.error);
    } catch {
      setError("Couldn't reach the server — the schedule still exists.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Recurring invoices</h1>
        <p className="text-sm text-neutral-500">
          Each schedule generates a fresh draft on its date — numbered in your
          sequence, dated to its period. Auto-send emails it the moment it is
          generated.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-overdue">
          {error}
        </p>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No schedules yet. Open an{" "}
          <Link href="/app" className="font-medium text-bolt-amberDark underline">
            invoice
          </Link>{" "}
          and use “Make recurring” to create one from it.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Cadence</th>
                <th className="px-4 py-2 font-medium">Next invoice</th>
                <th className="px-4 py-2 font-medium">Terms</th>
                <th className="px-4 py-2 font-medium">Auto-send</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {schedules.map((schedule) => (
                <tr
                  key={schedule.id}
                  className={schedule.active ? "" : "opacity-50"}
                >
                  <td className="px-4 py-3 font-medium">
                    {schedule.clientName || (
                      <span className="text-neutral-400">No client</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {cadenceLabel(schedule.cadence)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {schedule.active ? (
                      formatDate(schedule.nextIssueDate, "en")
                    ) : (
                      <span className="text-neutral-400">Paused</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {schedule.paymentTermsDays} days
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {schedule.autoSend ? "On" : "Off"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={busyId === schedule.id}
                        onClick={() => void onToggle(schedule)}
                        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        {schedule.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === schedule.id}
                        onClick={() => void onDelete(schedule)}
                        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-overdue hover:text-overdue disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
