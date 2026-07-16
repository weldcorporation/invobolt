"use client";

import { useState } from "react";
import { isEmailAddress } from "@/lib/invoice-email";
import { sendInvoiceAction } from "../../actions";

interface Props {
  id: string;
  /** The invoice's current bill-to email — the default recipient. */
  defaultTo: string;
  /** Called after a successful send so the editor can reflect draft → sent. */
  onSent: () => void;
}

/**
 * Email the invoice: a two-step control, because sending is the one editor
 * action that leaves the account. The first click only opens the recipient
 * field (pre-filled from the bill-to, editable); nothing is delivered until
 * the explicit second click.
 */
export function SendControls({ id, defaultTo, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onOpen = () => {
    setTo(defaultTo);
    setError(null);
    setOpen(true);
  };

  const onSend = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await sendInvoiceAction(id, to);
      if (result.ok) {
        setSentTo(result.to);
        setOpen(false);
        onSent();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server — nothing was sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Email
      </span>

      {open ? (
        <>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-950"
          />
          <button
            type="button"
            disabled={sending || !isEmailAddress(to.trim())}
            onClick={() => void onSend()}
            className="shrink-0 rounded-md bg-bolt-amber px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-bolt-amberDark disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send invoice"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-neutral-500">
            {sentTo ? (
              <>✓ Sent to {sentTo}</>
            ) : (
              <>
                Emails your client a link to this invoice — the same share link
                as above, so revoking it later still works.
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {sentTo ? "Send again…" : "Send invoice…"}
          </button>
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
