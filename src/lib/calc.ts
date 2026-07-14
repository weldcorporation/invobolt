/**
 * Invoice maths — subtotal, discount, per-rate VAT breakdown, and total.
 *
 * All rounding is done once, at the moment a value is surfaced, using
 * round-half-up on cents. Intermediate line values are kept full-precision so
 * a multi-line invoice totals to the same number a human would reach.
 */

import type { Invoice, LineItem, VatMode } from "./types";

export function round2(n: number): number {
  // Guard against binary-float noise (e.g. 1.005) before rounding.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineNet(item: LineItem): number {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  const price = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return qty * price;
}

/** Effective VAT rate for a line, honouring the invoice-wide VAT mode. */
export function effectiveRate(rate: number, mode: VatMode): number {
  if (mode === "reverse" || mode === "exempt") return 0;
  return Number.isFinite(rate) ? rate : 0;
}

export interface VatBucket {
  rate: number;
  base: number;
  vat: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  /** Subtotal after discount — the taxable base. */
  netAfterDiscount: number;
  vatBuckets: VatBucket[];
  vatTotal: number;
  total: number;
}

export function computeTotals(invoice: Invoice): InvoiceTotals {
  const subtotal = invoice.items.reduce((sum, it) => sum + lineNet(it), 0);

  const discountPct = Number.isFinite(invoice.discountPercent)
    ? Math.min(Math.max(invoice.discountPercent, 0), 100)
    : 0;
  const discount = subtotal * (discountPct / 100);
  const netAfterDiscount = subtotal - discount;

  // Discount is applied proportionally across lines so each VAT bucket shrinks
  // in step with the discount.
  const discountFactor = subtotal > 0 ? netAfterDiscount / subtotal : 1;

  const buckets = new Map<number, VatBucket>();
  for (const item of invoice.items) {
    const rate = effectiveRate(item.vatRate, invoice.vatMode);
    const base = lineNet(item) * discountFactor;
    const existing = buckets.get(rate) ?? { rate, base: 0, vat: 0 };
    existing.base += base;
    existing.vat += base * (rate / 100);
    buckets.set(rate, existing);
  }

  const vatBuckets = Array.from(buckets.values())
    .map((b) => ({ rate: b.rate, base: round2(b.base), vat: round2(b.vat) }))
    .sort((a, b) => a.rate - b.rate);

  const vatTotal = vatBuckets.reduce((s, b) => s + b.vat, 0);
  const total = round2(netAfterDiscount) + round2(vatTotal);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    netAfterDiscount: round2(netAfterDiscount),
    vatBuckets,
    vatTotal: round2(vatTotal),
    total: round2(total),
  };
}
