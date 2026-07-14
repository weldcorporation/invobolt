/**
 * Local-first persistence for the seller's business profile.
 *
 * This is the ONLY thing Invobolt remembers between visits, and it lives in
 * localStorage on the user's own device — never sent anywhere. Workspace mode
 * (v0.2) will layer optional cross-device sync on top; instant mode stays
 * purely local.
 */

import type { BusinessProfile, Invoice } from "./types";

const KEY = "invobolt.profile.v1";

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
  const profile: BusinessProfile = {
    seller: invoice.seller,
    currency: invoice.currency,
    locale: invoice.locale,
    template: invoice.template,
    accentColor: invoice.accentColor,
    paymentTerms: invoice.paymentTerms,
    logoDataUrl: invoice.logoDataUrl,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
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

/** Merge a saved profile onto a fresh invoice. */
export function applyProfile(
  invoice: Invoice,
  profile: BusinessProfile,
): Invoice {
  return {
    ...invoice,
    seller: profile.seller,
    currency: profile.currency,
    locale: profile.locale,
    template: profile.template,
    accentColor: profile.accentColor,
    paymentTerms: profile.paymentTerms,
    logoDataUrl: profile.logoDataUrl,
  };
}
