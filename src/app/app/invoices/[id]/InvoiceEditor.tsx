"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { InvoiceForm } from "@/components/InvoiceForm";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { validateInvoice } from "@/lib/invoice-row";
import { ui } from "@/lib/i18n";
import {
  TRANSITIONS,
  displayStatus,
  transitionLabel,
  type InvoiceStatus,
} from "@/lib/status";
import type { Invoice, Locale } from "@/lib/types";
import {
  deleteInvoiceAction,
  saveInvoiceAction,
  setInvoiceStatusAction,
} from "../../actions";
import { StatusBadge } from "../../StatusBadge";

/**
 * Debounce for autosave. Long enough that typing a word is one write, short
 * enough that the "Saved" tick feels like a response to what you just typed.
 */
const AUTOSAVE_MS = 700;

type SaveState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

interface Props {
  id: string;
  initialStatus: InvoiceStatus;
  initialDocument: Invoice;
  /** Today, per the server — see the page component. */
  today: string;
}

/**
 * The workspace editing surface.
 *
 * `InvoiceForm` and `InvoiceDocument` are reused verbatim from instant mode —
 * the only difference on this surface is where the invoice comes from and goes:
 * a debounced Server Action instead of localStorage. There is no save button by
 * design (see the design doc's resolved decision 3).
 */
export function InvoiceEditor({
  id,
  initialStatus,
  initialDocument,
  today,
}: Props) {
  const [invoice, setInvoice] = useState<Invoice>(initialDocument);
  const [status, setStatus] = useState<InvoiceStatus>(initialStatus);
  const [movingTo, setMovingTo] = useState<InvoiceStatus | null>(null);
  const [uiLocale, setUiLocale] = useState<Locale>(initialDocument.locale);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const timer = useRef<number | null>(null);
  // The latest document, readable from the unmount cleanup without making the
  // cleanup depend on `invoice` (which would re-run it on every keystroke).
  const latest = useRef(initialDocument);
  const dirty = useRef(false);

  const save = useCallback(
    async (document: Invoice) => {
      dirty.current = false;
      setSaveState({ kind: "saving" });
      try {
        const result = await saveInvoiceAction(id, document);
        setSaveState(
          result.ok
            ? { kind: "saved" }
            : { kind: "error", message: result.error },
        );
      } catch {
        setSaveState({
          kind: "error",
          message: "Couldn't reach the server — your last change isn't saved.",
        });
      }
    },
    [id],
  );

  const onChange = (next: Invoice) => {
    setInvoice(next);
    latest.current = next;
    dirty.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);

    // Don't burn a round-trip on a document the DB would reject anyway; say so
    // immediately instead, and let the next valid edit save.
    const problems = validateInvoice(next);
    if (problems.length > 0) {
      setSaveState({ kind: "error", message: problems[0] });
      return;
    }

    setSaveState({ kind: "pending" });
    timer.current = window.setTimeout(() => void save(next), AUTOSAVE_MS);
  };

  // Flush a pending edit if the user leaves within the debounce window —
  // otherwise the last thing they typed would be the one thing not saved.
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (!dirty.current) return;
      if (validateInvoice(latest.current).length > 0) return;
      void saveInvoiceAction(id, latest.current);
    };
  }, [id]);

  const onTransition = async (to: InvoiceStatus) => {
    setMovingTo(to);
    try {
      const result = await setInvoiceStatusAction(id, to);
      // The server re-checks the transition against the row's *current* status,
      // so trust its answer over our optimistic view of where we were.
      if (result.ok) setStatus(to);
      else setSaveState({ kind: "error", message: result.error });
    } catch {
      setSaveState({
        kind: "error",
        message: "Couldn't reach the server — the status is unchanged.",
      });
    } finally {
      setMovingTo(null);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    dirty.current = false;
    await deleteInvoiceAction(id);
  };

  const s = ui(uiLocale);
  const preview = useMemo(() => <InvoiceDocument invoice={invoice} />, [invoice]);
  // Follows the due date as it is edited, so clearing an overdue date updates
  // the badge immediately rather than after a reload.
  const shown = displayStatus(status, invoice.dueDate || null, today);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="text-sm font-medium text-neutral-500 hover:text-ink dark:hover:text-white"
          >
            ← All invoices
          </Link>
          <h1 className="text-lg font-bold tracking-tight">{invoice.number}</h1>
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <div className="mr-1 hidden items-center rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-700 sm:flex">
            {(["en", "nl"] as Locale[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setUiLocale(l)}
                className={`rounded px-2 py-1 font-medium uppercase ${
                  uiLocale === l
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "text-neutral-500"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-overdue hover:text-overdue dark:border-neutral-700 dark:text-neutral-200"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
          >
            ⚡ {s.exportPdf}
          </button>
        </div>
      </div>

      {/* Only legal transitions are offered — the state machine decides what
          appears here, and the server re-checks it before anything moves. */}
      <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Status
        </span>
        <StatusBadge status={shown} />
        {shown === "overdue" && (
          <span className="text-xs text-neutral-500">
            sent, past its {invoice.dueDate} due date
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {TRANSITIONS[status].map((to) => (
            <button
              key={to}
              type="button"
              disabled={movingTo !== null}
              onClick={() => void onTransition(to)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                to === "void"
                  ? "border-neutral-300 text-neutral-600 hover:border-overdue hover:text-overdue dark:border-neutral-700 dark:text-neutral-300"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              {movingTo === to ? "…" : transitionLabel(status, to)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="no-print">
          <InvoiceForm invoice={invoice} onChange={onChange} uiLocale={uiLocale} />
        </div>

        <div className="print-root">
          <div className="mx-auto w-full max-w-[820px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200 dark:ring-neutral-800">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;

  if (state.kind === "error") {
    return (
      <span
        role="status"
        className="max-w-[22rem] truncate text-xs font-medium text-overdue"
        title={state.message}
      >
        {state.message}
      </span>
    );
  }

  const label =
    state.kind === "saved" ? "✓ Saved" : state.kind === "saving" ? "Saving…" : "Editing…";

  return (
    <span role="status" className="text-xs font-medium text-neutral-400">
      {label}
    </span>
  );
}
