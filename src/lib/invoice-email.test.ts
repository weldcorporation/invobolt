import { describe, expect, it } from "vitest";
import { buildInvoiceEmail, isEmailAddress } from "./invoice-email";
import { sampleInvoice } from "./sample";
import type { Invoice } from "./types";

const SHARE_URL = "https://invobolt.example/i/abc123";
const PAY_URL = "https://pay.example/link";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return { ...sampleInvoice("2026-07-01", "2026-07-15"), ...overrides };
}

describe("isEmailAddress", () => {
  it("accepts a plain address", () => {
    expect(isEmailAddress("ap@acme.example")).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["not-an-email", "no @"],
    ["a@b", "no dot in domain"],
    ["two words@acme.example", "whitespace"],
    ["a@acme.example\nBcc: x@y.example", "newline (header injection)"],
    [`${"a".repeat(320)}@acme.example`, "over the length bound"],
  ])("rejects %s (%s)", (value) => {
    expect(isEmailAddress(value)).toBe(false);
  });
});

describe("buildInvoiceEmail", () => {
  it("names the sender and number in the subject", () => {
    const email = buildInvoiceEmail(invoice(), SHARE_URL, null);
    expect(email.subject).toBe("Invoice 2026-001 from Your Company BV");
  });

  it("copes with a blank seller name", () => {
    const doc = invoice();
    doc.seller = { ...doc.seller, name: "" };
    const email = buildInvoiceEmail(doc, SHARE_URL, null);
    expect(email.subject).toBe("Invoice 2026-001");
    expect(email.text).toContain("You received invoice 2026-001.");
  });

  it("contains the amount due, the due date, and the share link", () => {
    const email = buildInvoiceEmail(invoice(), SHARE_URL, null);
    expect(email.text).toContain("Amount due:");
    // sample invoice: (1800 + 6×95) × 1.21 = 2867.70 — the recipient must see
    // the VAT-inclusive total, not the subtotal.
    expect(email.text).toContain("2,867.70");
    expect(email.text).toContain("Due date:");
    expect(email.text).toContain(SHARE_URL);
  });

  it("omits the due-date line when there is no due date", () => {
    const email = buildInvoiceEmail(invoice({ dueDate: "" }), SHARE_URL, null);
    expect(email.text).not.toContain("Due date:");
  });

  it("stays minimal: no line-item detail in the body", () => {
    const email = buildInvoiceEmail(invoice(), SHARE_URL, null);
    expect(email.text).not.toContain("Design & build");
    expect(email.text).not.toContain("Consulting");
  });

  it("adds a pay section only when a payment link is set", () => {
    const without = buildInvoiceEmail(invoice(), SHARE_URL, null);
    expect(without.text).not.toContain("Pay online");

    const withLink = buildInvoiceEmail(invoice(), SHARE_URL, PAY_URL);
    expect(withLink.text).toContain("Pay online:");
    expect(withLink.text).toContain(PAY_URL);
  });

  it("follows the invoice locale, not the UI's", () => {
    const email = buildInvoiceEmail(invoice({ locale: "nl" }), SHARE_URL, PAY_URL);
    expect(email.subject).toBe("Factuur 2026-001 van Your Company BV");
    expect(email.text).toContain("Te betalen:");
    expect(email.text).toContain("Online betalen:");
  });
});
