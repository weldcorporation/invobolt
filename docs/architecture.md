# Architecture

A short tour of how Invobolt v0.1 is put together. The guiding constraint is
**instant mode is local-first**: the generator runs entirely in the browser and
sends nothing over the network.

## Data flow

```
        ┌─────────────────────────────────────────────┐
        │  page.tsx  (client, owns the Invoice state)  │
        └───────────────┬───────────────┬─────────────┘
                        │ invoice       │ invoice
                        ▼               ▼
              InvoiceForm.tsx     InvoiceDocument.tsx
              (edits → onChange)  (renders the A4 sheet)
                        │                 ▲
                        └── setInvoice ───┘
```

`page.tsx` holds a single `Invoice` object in React state. `InvoiceForm` is a
controlled component: it renders that object and reports every edit back through
`onChange`. `InvoiceDocument` is a pure function of the same object, so the
preview is always exactly what will print.

## The `Invoice` model

Defined in [`src/lib/types.ts`](../src/lib/types.ts). It's plain, JSON-serialisable
data — no classes, no methods — so it can move to IndexedDB (PWA) or a Postgres
row (workspace mode) later without change. Money is stored as decimal numbers in
the invoice currency; rounding happens only when totals are computed.

## Totals & VAT

[`src/lib/calc.ts`](../src/lib/calc.ts) is the single source of truth for maths:

- `computeTotals(invoice)` returns subtotal, discount, a **per-rate VAT
  breakdown**, and the grand total.
- Discounts are applied proportionally across lines so each VAT bucket shrinks in
  step.
- `vatMode` switches the whole invoice between `standard`, `reverse` (EU B2B
  reverse charge — 0% VAT + a legal note), and `exempt`.
- All rounding is half-up on cents via `round2`, applied once at the surface so a
  multi-line invoice totals to what a human would reach.

## Rendering & PDF export

Templates live in [`src/components/InvoiceDocument.tsx`](../src/components/InvoiceDocument.tsx).
Each is a self-contained A4 sheet (`.invoice-sheet`). Export uses the browser's
native print dialog (`window.print()`); the print stylesheet in
[`globals.css`](../src/app/globals.css) hides everything except `.print-root`,
sets the page to A4 with no margins, and strips shadows/rounding. This yields a
vector, selectable-text PDF with no rendering library and no second code path to
keep in sync with the preview.

## Internationalisation

[`src/lib/i18n.ts`](../src/lib/i18n.ts) holds two dictionaries per locale: `Dict`
(strings printed **on** the invoice, following `invoice.locale`) and `UIStrings`
(the app chrome, following the UI toggle). This separation lets you edit a Dutch
invoice while keeping the UI in English. No i18n library — the surface is small
and adding a locale is just adding an object.

## Persistence

[`src/lib/storage.ts`](../src/lib/storage.ts) persists **only** the seller's
business profile (name, address, VAT number, defaults) to `localStorage`, on the
user's own device. It's loaded once after mount to avoid SSR hydration
mismatches. Nothing else is stored, and nothing is uploaded.

## What's intentionally not here yet

Workspace mode (magic-link auth + Neon Postgres), Stripe import, recurring
invoices, and email delivery are all planned for later versions and deliberately
excluded from v0.1 to keep "no login" strictly true. See the
[roadmap](../README.md#roadmap).
