"use client";

import { useState } from "react";
import Link from "next/link";
import { CADENCES, cadenceLabel, type Cadence } from "@/lib/cadence";
import { makeRecurringAction } from "../../recurring/actions";

interface Props {
  id: string;
  /** Days between the invoice's issue and due date, as the terms default. */
  defaultTermsDays: number;
  emailEnabled: boolean;
  /**
   * Whether this invoice already has a schedule, per the server on this load.
   * The server refuses a second one regardless (a unique index sees to it);
   * this is so the UI doesn't offer what would be refused.
   */
  hasSchedule: boolean;
}

/**
 * "Make recurring": turns this invoice into a schedule template. Collapsed by
 * default — most invoices are one-offs — and creation is one explicit click
 * after choosing the cadence.
 */
export function RecurringControls({
  id,
  defaultTermsDays,
  emailEnabled,
  hasSchedule,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [termsDays, setTermsDays] = useState(defaultTermsDays);
  const [autoSend, setAutoSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduled = hasSchedule || created;

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await makeRecurringAction(id, cadence, termsDays, autoSend);
      if (result.ok) {
        setCreated(true);
        setOpen(false);
      } else setError(result.error);
    } catch {
      setError("Couldn't reach the server — no schedule was created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Recurring
      </span>

      {open ? (
        <>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {cadenceLabel(c)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            due in
            <input
              type="number"
              min={0}
              max={365}
              value={termsDays}
              onChange={(e) => setTermsDays(Number(e.target.value))}
              className="w-16 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950"
            />
            days
          </label>
          {emailEnabled && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
              />
              email it automatically
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCreate()}
            className="shrink-0 rounded-md bg-bolt-amber px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-bolt-amberDark disabled:opacity-50"
          >
            {busy ? "…" : "Create schedule"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-neutral-500">
            {scheduled ? (
              <>
                {created ? "✓ Schedule created — " : "This invoice recurs. "}
                <Link
                  href="/app/recurring"
                  className="underline hover:text-neutral-600"
                >
                  Manage it
                </Link>
                . Future drafts copy this invoice as it was when the schedule
                was made.
              </>
            ) : (
              <>
                Generate a fresh draft of this invoice on a schedule — dated to
                its period, numbered in your sequence.
              </>
            )}
          </span>
          {!scheduled && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Make recurring…
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="w-full text-xs font-medium text-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
