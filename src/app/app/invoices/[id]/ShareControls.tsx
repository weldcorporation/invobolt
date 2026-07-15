"use client";

import { useEffect, useState } from "react";
import { shareInvoiceAction, unshareInvoiceAction } from "../../actions";

interface Props {
  id: string;
  initialToken: string | null;
}

/**
 * Share link controls: mint, copy, revoke.
 *
 * The link is a capability — anyone holding it can read the invoice — so the
 * copy says that plainly rather than implying the recipient is authenticated.
 */
export function ShareControls({ id, initialToken }: Props) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The public origin isn't known during SSR, so the first paint shows the
  // path and this fills in the absolute URL after mount — same value on both
  // renders, so no hydration mismatch.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const path = token ? `/i/${token}` : null;
  const url = path ? `${origin}${path}` : null;

  const onShare = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await shareInvoiceAction(id);
      if (result.ok) setToken(result.token);
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server — nothing was shared.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async () => {
    if (
      !window.confirm(
        "Revoke this link? Anyone you've sent it to will stop being able to open the invoice.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await unshareInvoiceAction(id);
      if (result.ok) {
        setToken(null);
        setCopied(false);
      } else setError(result.error);
    } catch {
      setError("Couldn't reach the server — the link is still live.");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Share
      </span>

      {token ? (
        <>
          <input
            readOnly
            value={url ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          />
          <button
            type="button"
            onClick={() => void onCopy()}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRevoke()}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-overdue hover:text-overdue disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Revoke
          </button>
        </>
      ) : (
        <>
          <span className="text-xs text-neutral-500">
            Not shared. A link lets anyone who has it view this invoice — no
            account needed.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onShare()}
            className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {busy ? "…" : "Create link"}
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
