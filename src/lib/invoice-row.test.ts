import { describe, it, expect } from "vitest";
import {
  MAX_LOGO_CHARS,
  deriveInvoiceColumns,
  invoiceTotalCents,
  nextInvoiceNumber,
  validateInvoice,
} from "@/lib/invoice-row";
import type { Invoice } from "@/lib/types";

/** A persistable invoice; tests override only the field under test. */
function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    template: "modern",
    locale: "en",
    currency: "EUR",
    seller: {
      name: "Me BV",
      address: "",
      vatNumber: "",
      email: "",
      country: "",
    },
    client: {
      name: "Acme",
      address: "",
      vatNumber: "",
      email: "",
      country: "",
    },
    number: "2026-001",
    issueDate: "2026-01-15",
    dueDate: "2026-01-29",
    items: [
      { id: "li_1", description: "Work", quantity: 2, unitPrice: 100, vatRate: 21 },
    ],
    vatMode: "standard",
    discountPercent: 0,
    notes: "",
    paymentTerms: "",
    accentColor: "#F5A524",
    ...partial,
  };
}

describe("invoiceTotalCents", () => {
  it("matches computeTotals, in minor units", () => {
    // 2 x 100 = 200 net, +21% VAT = 242.00
    expect(invoiceTotalCents(invoice())).toBe(24200);
  });

  it("rounds to whole cents rather than truncating", () => {
    // 3 x 3.33 = 9.99 net, +21% VAT = 12.0879 -> 12.09
    const inv = invoice({
      items: [
        { id: "li_1", description: "x", quantity: 3, unitPrice: 3.33, vatRate: 21 },
      ],
    });
    expect(invoiceTotalCents(inv)).toBe(1209);
  });

  it("drops VAT under reverse charge", () => {
    expect(invoiceTotalCents(invoice({ vatMode: "reverse" }))).toBe(20000);
  });

  it("is zero for an invoice with no items", () => {
    expect(invoiceTotalCents(invoice({ items: [] }))).toBe(0);
  });
});

describe("deriveInvoiceColumns", () => {
  it("lifts the queried columns off the document", () => {
    expect(deriveInvoiceColumns(invoice())).toEqual({
      number: "2026-001",
      issueDate: "2026-01-15",
      dueDate: "2026-01-29",
      currency: "EUR",
      totalCents: 24200,
    });
  });

  it("maps an empty due date to NULL, since the column is nullable", () => {
    expect(deriveInvoiceColumns(invoice({ dueDate: "" })).dueDate).toBeNull();
  });

  it("trims the number so ' 2026-1 ' and '2026-1' collide on the unique index", () => {
    expect(deriveInvoiceColumns(invoice({ number: "  2026-1  " })).number).toBe(
      "2026-1",
    );
  });
});

describe("nextInvoiceNumber", () => {
  it("starts a fresh year at 001", () => {
    expect(nextInvoiceNumber([], 2026)).toBe("2026-001");
  });

  it("continues from the highest number in that year", () => {
    expect(nextInvoiceNumber(["2026-001", "2026-002"], 2026)).toBe("2026-003");
  });

  it("uses the highest, not the count — gaps must not cause a collision", () => {
    expect(nextInvoiceNumber(["2026-001", "2026-009"], 2026)).toBe("2026-010");
  });

  it("scopes to the year, ignoring other years", () => {
    expect(nextInvoiceNumber(["2025-007", "2026-001"], 2026)).toBe("2026-002");
  });

  it("ignores free-form numbers, since the field is user-editable", () => {
    expect(nextInvoiceNumber(["INV-42", "draft", "2026-004"], 2026)).toBe(
      "2026-005",
    );
  });

  it("keeps counting past 999 without truncating", () => {
    expect(nextInvoiceNumber(["2026-999"], 2026)).toBe("2026-1000");
  });
});

describe("validateInvoice", () => {
  it("passes a complete invoice", () => {
    expect(validateInvoice(invoice())).toEqual([]);
  });

  it("rejects a blank number (NOT NULL + unique per user)", () => {
    expect(validateInvoice(invoice({ number: "   " }))).toContain(
      "Invoice number is required.",
    );
  });

  it("rejects a missing issue date (NOT NULL)", () => {
    expect(validateInvoice(invoice({ issueDate: "" }))).toContain(
      "Issue date is required.",
    );
  });

  it("allows an empty due date but not a malformed one", () => {
    expect(validateInvoice(invoice({ dueDate: "" }))).toEqual([]);
    expect(validateInvoice(invoice({ dueDate: "29-01-2026" }))).toContain(
      "Due date must be a valid date.",
    );
  });

  it("rejects an oversized logo instead of writing it to Postgres", () => {
    const logoDataUrl = "d".repeat(MAX_LOGO_CHARS + 1);
    expect(validateInvoice(invoice({ logoDataUrl }))).toContain(
      "Logo is too large — use an image under 512 KB.",
    );
  });

  it("accepts a logo at the cap", () => {
    const logoDataUrl = "d".repeat(MAX_LOGO_CHARS);
    expect(validateInvoice(invoice({ logoDataUrl }))).toEqual([]);
  });
});
