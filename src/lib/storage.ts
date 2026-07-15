/**
 * Local-first persistence for the seller's business profile.
 *
 * In instant mode this is the ONLY thing Invobolt remembers between visits, and
 * it lives in localStorage on the user's own device — never sent anywhere.
 * Workspace mode can *offer* to copy it into an account (see the one-time
 * import), but only ever when the user clicks: nothing in this module uploads.
 *
 * Every browser-touching function lives here; the rules about what a profile
 * *is* live in `profile.ts`, which server code can import without dragging
 * localStorage along.
 */

import { profileFromInvoice } from "./profile";
import type { BusinessProfile, Invoice } from "./types";

const KEY = "invobolt.profile.v1";

/**
 * Whether the user has waved off the workspace import prompt.
 *
 * Deliberately local, not a column: the prompt can only ever appear on a device
 * that has a local profile, so the answer belongs on that device. It also means
 * declining costs the server nothing and tells it nothing.
 */
const IMPORT_DISMISSED_KEY = "invobolt.import-dismissed.v1";

export function loadProfile(): BusinessProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BusinessProfile;
  } catch {
    return null;
  }
}

export function saveProfile(invoice: Invoice): void {
  if (typeof window === "undefined") return;
  // Derived outside the try on purpose: the catch below is for the browser
  // refusing to store, not for swallowing a bug of ours.
  const profile = JSON.stringify(profileFromInvoice(invoice));
  try {
    window.localStorage.setItem(KEY, profile);
  } catch {
    /* storage full or blocked — non-fatal, we simply don't remember. */
  }
}

export function clearProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isImportDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(IMPORT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissImport(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMPORT_DISMISSED_KEY, "1");
  } catch {
    /* ignore — worst case we offer again next visit. */
  }
}
