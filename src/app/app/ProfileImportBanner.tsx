"use client";

import { useEffect, useState } from "react";
import { dismissImport, isImportDismissed, loadProfile } from "@/lib/storage";
import { importProfileAction } from "./actions";
import type { BusinessProfile } from "@/lib/types";

/**
 * The one-time on-ramp from instant mode.
 *
 * **Nothing here uploads on its own.** The profile is read from localStorage
 * into component state and stays there; the only thing that sends it is the
 * user pressing Import. That's the promise instant mode makes on `/` and this
 * is the seam where it would be easiest to break — so the read is local, the
 * write is a click, and declining doesn't tell the server anything either
 * (the dismissal is a localStorage flag, not a column).
 *
 * It appears only when all three are true: this device has a saved profile, the
 * account has none yet, and the user hasn't waved it off here before.
 */
export function ProfileImportBanner({
  hasServerProfile,
}: {
  hasServerProfile: boolean;
}) {
  const [local, setLocal] = useState<BusinessProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // localStorage doesn't exist during SSR, so the offer can only be decided
  // after mount. Until then we render nothing, which is also the right answer
  // for everyone who has no local profile.
  useEffect(() => {
    if (hasServerProfile || isImportDismissed()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(loadProfile());
  }, [hasServerProfile]);

  if (!local || done) return null;

  const onImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importProfileAction(local);
      if (result.ok) setDone(true);
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server — nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = () => {
    dismissImport();
    setDone(true);
  };

  return (
    <div className="rounded-xl border border-bolt-amber/40 bg-bolt-amber/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            Import your business details from this device?
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            This browser has details saved from the instant generator
            {local.seller.name ? ` for ${local.seller.name}` : ""}. Import them
            and every new invoice starts pre-filled.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            They&apos;re still only on this device — nothing is uploaded unless
            you press Import.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-overdue">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-3 py-2 text-sm font-medium text-neutral-500 hover:text-ink dark:hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onImport()}
            className="rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
