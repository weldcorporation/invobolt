"use client";

import { useState } from "react";
import {
  normalizePaymentLink,
  validatePaymentLink,
} from "@/lib/payment-link";
import { setPaymentLinkAction } from "../../actions";

interface Props {
  id: string;
  initialUrl: string | null;
}

/**
 * The "Pay now" link: a pasted https URL, provider-agnostic. Stored on the
 * row and rendered as a button for the recipient on the shared page and in
 * the invoice email — which is why it validates like an href, not like text.
 */
export function PaymentLinkControls({ id, initialUrl }: Props) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [savedValue, setSavedValue] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePaymentLink(value);
  const problems = normalized ? validatePaymentLink(normalized) : [];
  const dirty = (normalized ?? "") !== savedValue;

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setPaymentLinkAction(id, value);
      if (result.ok) {
        setSavedValue(normalized ?? "");
        setValue(normalized ?? "");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server — the link is unchanged.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Pay now
      </span>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https:// — a Stripe Payment Link, PayPal.me, Tikkie…"
        className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950"
      />
      <button
        type="button"
        disabled={saving || !dirty || problems.length > 0}
        title={problems[0]}
        onClick={() => void onSave()}
        className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {saving ? "…" : normalized ? "Save link" : savedValue ? "Remove" : "Save link"}
      </button>

      <p className="w-full text-[11px] text-neutral-400">
        {error ?? problems[0] ?? (
          <>
            Shown as a Pay now button on the shared page and in the invoice
            email. Payments happen on your provider — nothing is processed
            here.
          </>
        )}
      </p>
    </div>
  );
}
