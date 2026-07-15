"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Signs out via the Neon Auth client, then returns to instant mode. */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await authClient.signOut();
        } finally {
          window.location.href = "/";
        }
      }}
      className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
