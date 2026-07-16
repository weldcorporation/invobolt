import { describe, expect, it } from "vitest";
import {
  MAX_PAYMENT_LINK_CHARS,
  normalizePaymentLink,
  validatePaymentLink,
} from "./payment-link";

describe("normalizePaymentLink", () => {
  it("trims, and turns empty into null so clearing the field clears the link", () => {
    expect(normalizePaymentLink("  https://pay.example  ")).toBe(
      "https://pay.example",
    );
    expect(normalizePaymentLink("")).toBeNull();
    expect(normalizePaymentLink("   ")).toBeNull();
  });
});

describe("validatePaymentLink", () => {
  it("accepts a normal https URL", () => {
    expect(validatePaymentLink("https://buy.stripe.com/abc123")).toEqual([]);
  });

  it.each([
    ["http://pay.example", "plain http"],
    ["javascript:alert(1)", "javascript: scheme"],
    ["ftp://pay.example", "other scheme"],
    ["pay.example/link", "no scheme at all"],
    ["https://yourbank.com:secret@evil.example", "embedded credentials"],
    [`https://pay.example/${"a".repeat(MAX_PAYMENT_LINK_CHARS)}`, "too long"],
  ])("rejects %s (%s)", (url) => {
    expect(validatePaymentLink(url).length).toBeGreaterThan(0);
  });
});
