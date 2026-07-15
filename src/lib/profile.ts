/**
 * Pure helpers for the `BusinessProfile` — the seller defaults a new invoice
 * starts from.
 *
 * Instant mode keeps this in localStorage; workspace mode keeps it in Postgres,
 * seeded by the one-time import. The *rules* are the same on both surfaces, so
 * they live here rather than in `storage.ts`: that module is browser
 * persistence, and server code has no business importing it to reach a merge
 * function.
 */

import { MAX_LOGO_CHARS } from "./invoice-row";
import { isParty, normalizeParty, MAX_PARTY_FIELD_CHARS } from "./party";
import type { BusinessProfile, Invoice, Locale, TemplateId } from "./types";

/** The runtime counterparts of the `Locale` / `TemplateId` unions, which erase. */
const LOCALES: readonly string[] = ["en", "nl"] satisfies Locale[];
const TEMPLATES: readonly string[] = [
  "classic",
  "modern",
  "minimal",
] satisfies TemplateId[];

/**
 * Narrow untrusted input.
 *
 * This one matters more than most: the value arrives from localStorage on the
 * user's own machine, which anything on the origin can write, and goes straight
 * into a jsonb column. Treat it as hostile.
 */
export function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (!isParty(candidate.seller)) return false;
  if (typeof candidate.currency !== "string") return false;
  if (typeof candidate.accentColor !== "string") return false;
  if (typeof candidate.paymentTerms !== "string") return false;
  if (!LOCALES.includes(candidate.locale as string)) return false;
  if (!TEMPLATES.includes(candidate.template as string)) return false;
  if (
    candidate.logoDataUrl !== undefined &&
    typeof candidate.logoDataUrl !== "string"
  ) {
    return false;
  }
  return true;
}

/**
 * Rebuild the profile from known keys only, trimming as we go.
 *
 * As with `normalizeParty`, the rebuild is the sanitiser: a caller can't widen
 * the stored document by posting a fatter object.
 */
export function normalizeBusinessProfile(
  profile: BusinessProfile,
): BusinessProfile {
  const normalized: BusinessProfile = {
    seller: normalizeParty(profile.seller),
    currency: profile.currency.trim(),
    locale: profile.locale,
    template: profile.template,
    accentColor: profile.accentColor.trim(),
    paymentTerms: profile.paymentTerms.trim(),
  };
  // Only set the key when there's a logo: `logoDataUrl: undefined` would
  // serialise into the column as an explicit null.
  if (profile.logoDataUrl) normalized.logoDataUrl = profile.logoDataUrl;
  return normalized;
}

/** Problems that would make a profile unsafe to store, in plain English. */
export function validateBusinessProfile(profile: BusinessProfile): string[] {
  const problems: string[] = [];
  const normalized = normalizeBusinessProfile(profile);

  if (normalized.logoDataUrl && normalized.logoDataUrl.length > MAX_LOGO_CHARS) {
    problems.push("Your saved logo is too large to import — under 512 KB.");
  }
  const longField = Object.values(normalized.seller).some(
    (v) => v.length > MAX_PARTY_FIELD_CHARS,
  );
  if (longField) problems.push("Your saved business details are too long.");
  if (normalized.paymentTerms.length > MAX_PARTY_FIELD_CHARS) {
    problems.push("Your saved payment terms are too long.");
  }

  return problems;
}

/**
 * The profile an invoice implies — used to save the invoice you're looking at
 * as your defaults.
 */
export function profileFromInvoice(invoice: Invoice): BusinessProfile {
  const profile: BusinessProfile = {
    seller: invoice.seller,
    currency: invoice.currency,
    locale: invoice.locale,
    template: invoice.template,
    accentColor: invoice.accentColor,
    paymentTerms: invoice.paymentTerms,
  };
  if (invoice.logoDataUrl) profile.logoDataUrl = invoice.logoDataUrl;
  return profile;
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
