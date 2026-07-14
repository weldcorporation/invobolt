/**
 * Core invoice domain types for Invobolt.
 *
 * Everything here is plain data — serialisable to JSON so it can live in the
 * browser (localStorage today, IndexedDB later) with no server round-trip.
 * Money is stored as decimal numbers in the invoice's currency; rounding only
 * happens at display/total time (see lib/calc.ts).
 */

export type TemplateId = "classic" | "modern" | "minimal";

export type Locale = "en" | "nl";

/** A party on the invoice — the seller (you) or the client (bill-to). */
export interface Party {
  name: string;
  /** Free-form multi-line address. */
  address: string;
  /** VAT / tax identification number, e.g. NL123456789B01. */
  vatNumber: string;
  email: string;
  /** ISO-ish country name or code, used for reverse-charge hints. */
  country: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** VAT rate as a percentage, e.g. 21 for 21%. Ignored when reverse charge. */
  vatRate: number;
}

/**
 * How VAT is applied to the whole invoice.
 * - "standard": VAT charged per line at each line's rate.
 * - "reverse": intra-EU B2B reverse charge — 0% VAT, note added.
 * - "exempt": no VAT (small business / out of scope).
 */
export type VatMode = "standard" | "reverse" | "exempt";

export interface Invoice {
  /** Rendering template. */
  template: TemplateId;
  /** Document language. */
  locale: Locale;
  /** ISO 4217 currency code, e.g. EUR, USD, GBP. */
  currency: string;

  seller: Party;
  client: Party;

  number: string;
  /** ISO date string (yyyy-mm-dd). */
  issueDate: string;
  /** ISO date string (yyyy-mm-dd). */
  dueDate: string;

  items: LineItem[];

  vatMode: VatMode;
  /** Optional early-payment or bulk discount, as a percentage of subtotal. */
  discountPercent: number;

  notes: string;
  /** Payment instructions, e.g. IBAN / Stripe link. */
  paymentTerms: string;

  /** Optional logo as a data URL (kept local, never uploaded). */
  logoDataUrl?: string;
  /** Accent colour for templates that use it. */
  accentColor: string;
}

/** The seller profile + defaults we remember between invoices. */
export interface BusinessProfile {
  seller: Party;
  currency: string;
  locale: Locale;
  template: TemplateId;
  accentColor: string;
  paymentTerms: string;
  logoDataUrl?: string;
}
