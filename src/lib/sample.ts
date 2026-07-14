/** Default invoice used to seed the generator so the preview is never empty. */

import type { Invoice, LineItem } from "./types";

let idCounter = 0;
/** Stable-per-session id generator (avoids SSR/client hydration mismatches). */
export function newId(): string {
  idCounter += 1;
  return `li_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyItem(): LineItem {
  return {
    id: newId(),
    description: "",
    quantity: 1,
    unitPrice: 0,
    vatRate: 21,
  };
}

/**
 * A friendly starter invoice. Dates are passed in from the caller so this
 * stays a pure function (no Date.now() at module load — keeps SSR stable).
 */
export function sampleInvoice(today: string, due: string): Invoice {
  return {
    template: "modern",
    locale: "en",
    currency: "EUR",
    seller: {
      name: "Your Company BV",
      address: "Voorbeeldstraat 1\n1011 AB Amsterdam\nNetherlands",
      vatNumber: "NL123456789B01",
      email: "hello@yourcompany.com",
      country: "Netherlands",
    },
    client: {
      name: "Acme Corp",
      address: "1 Market Street\nDublin D01 F5P2\nIreland",
      vatNumber: "IE1234567AB",
      email: "ap@acme.example",
      country: "Ireland",
    },
    number: "2026-001",
    issueDate: today,
    dueDate: due,
    items: [
      {
        id: newId(),
        description: "Design & build — landing page",
        quantity: 1,
        unitPrice: 1800,
        vatRate: 21,
      },
      {
        id: newId(),
        description: "Consulting (hours)",
        quantity: 6,
        unitPrice: 95,
        vatRate: 21,
      },
    ],
    vatMode: "standard",
    discountPercent: 0,
    notes: "Thanks for your business!",
    paymentTerms: "Bank transfer to IBAN NL00 BANK 0123 4567 89 within 14 days.",
    accentColor: "#F5A524",
  };
}
