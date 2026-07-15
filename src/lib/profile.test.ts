import { describe, it, expect } from "vitest";
import {
  applyProfile,
  isBusinessProfile,
  normalizeBusinessProfile,
  profileFromInvoice,
  validateBusinessProfile,
} from "@/lib/profile";
import { MAX_LOGO_CHARS } from "@/lib/invoice-row";
import { MAX_PARTY_FIELD_CHARS } from "@/lib/party";
import { emptyInvoice } from "@/lib/sample";
import type { BusinessProfile, Invoice } from "@/lib/types";

function profile(partial: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    seller: {
      name: "Weld Corporation BV",
      address: "Voorbeeldstraat 1",
      vatNumber: "NL123456789B01",
      email: "hello@weld.example",
      country: "Netherlands",
    },
    currency: "EUR",
    locale: "nl",
    template: "classic",
    accentColor: "#123456",
    paymentTerms: "Within 14 days.",
    ...partial,
  };
}

describe("isBusinessProfile", () => {
  it("accepts a well-formed profile, with and without a logo", () => {
    expect(isBusinessProfile(profile())).toBe(true);
    expect(isBusinessProfile(profile({ logoDataUrl: "data:image/png;base64,x" }))).toBe(true);
  });

  it("rejects anything that isn't one", () => {
    expect(isBusinessProfile(null)).toBe(false);
    expect(isBusinessProfile(undefined)).toBe(false);
    expect(isBusinessProfile("profile")).toBe(false);
    expect(isBusinessProfile({})).toBe(false);
    expect(isBusinessProfile([])).toBe(false);
  });

  it("rejects a profile whose seller isn't a party", () => {
    expect(isBusinessProfile({ ...profile(), seller: "Weld" })).toBe(false);
    expect(isBusinessProfile({ ...profile(), seller: {} })).toBe(false);
  });

  it("rejects a locale or template outside the union", () => {
    // These erase at runtime, so localStorage could hold anything.
    expect(isBusinessProfile({ ...profile(), locale: "fr" })).toBe(false);
    expect(isBusinessProfile({ ...profile(), template: "fancy" })).toBe(false);
    expect(isBusinessProfile({ ...profile(), locale: 1 })).toBe(false);
  });

  it("rejects a non-string logo", () => {
    expect(isBusinessProfile({ ...profile(), logoDataUrl: 42 })).toBe(false);
  });
});

describe("normalizeBusinessProfile", () => {
  it("trims and keeps the real fields", () => {
    const out = normalizeBusinessProfile(
      profile({ currency: " EUR ", paymentTerms: "  Within 14 days.  " }),
    );
    expect(out.currency).toBe("EUR");
    expect(out.paymentTerms).toBe("Within 14 days.");
    expect(out.seller.name).toBe("Weld Corporation BV");
  });

  it("drops keys that aren't a profile's, so localStorage can't widen the column", () => {
    const smuggled = { ...profile(), isAdmin: true, extra: "x" } as BusinessProfile;
    expect(Object.keys(normalizeBusinessProfile(smuggled)).sort()).toEqual([
      "accentColor",
      "currency",
      "locale",
      "paymentTerms",
      "seller",
      "template",
    ]);
  });

  it("omits logoDataUrl entirely when there is no logo", () => {
    expect("logoDataUrl" in normalizeBusinessProfile(profile())).toBe(false);
  });

  it("keeps a logo when there is one", () => {
    const out = normalizeBusinessProfile(profile({ logoDataUrl: "data:image/png;base64,x" }));
    expect(out.logoDataUrl).toBe("data:image/png;base64,x");
  });
});

describe("validateBusinessProfile", () => {
  it("passes a normal profile", () => {
    expect(validateBusinessProfile(profile())).toEqual([]);
  });

  it("rejects an oversized logo rather than writing it to Postgres", () => {
    expect(
      validateBusinessProfile(profile({ logoDataUrl: "d".repeat(MAX_LOGO_CHARS + 1) })),
    ).toContain("Your saved logo is too large to import — under 512 KB.");
  });

  it("bounds the seller fields and payment terms", () => {
    const long = "x".repeat(MAX_PARTY_FIELD_CHARS + 1);
    expect(
      validateBusinessProfile(profile({ seller: { ...profile().seller, address: long } })),
    ).toContain("Your saved business details are too long.");
    expect(validateBusinessProfile(profile({ paymentTerms: long }))).toContain(
      "Your saved payment terms are too long.",
    );
  });

  it("does not demand a seller name — an instant-mode profile may not have one", () => {
    expect(
      validateBusinessProfile(profile({ seller: { ...profile().seller, name: "" } })),
    ).toEqual([]);
  });
});

describe("applyProfile", () => {
  const blank = () => emptyInvoice("2026-07-15", "2026-07-29");

  it("fills the seller defaults onto a blank invoice", () => {
    const out = applyProfile(blank(), profile());
    expect(out.seller.name).toBe("Weld Corporation BV");
    expect(out.currency).toBe("EUR");
    expect(out.locale).toBe("nl");
    expect(out.template).toBe("classic");
    expect(out.accentColor).toBe("#123456");
    expect(out.paymentTerms).toBe("Within 14 days.");
  });

  it("leaves everything that isn't a default alone", () => {
    const before = blank();
    const out = applyProfile(before, profile());
    expect(out.number).toBe(before.number);
    expect(out.issueDate).toBe(before.issueDate);
    expect(out.dueDate).toBe(before.dueDate);
    expect(out.items).toEqual(before.items);
    // A profile is the *seller's* defaults; it must never fill in the client.
    expect(out.client).toEqual(before.client);
  });

  it("does not mutate its input", () => {
    const before = blank();
    const snapshot = JSON.parse(JSON.stringify(before)) as Invoice;
    applyProfile(before, profile());
    expect(before).toEqual(snapshot);
  });
});

describe("profileFromInvoice", () => {
  it("round-trips through applyProfile", () => {
    const seeded = applyProfile(emptyInvoice("2026-07-15", "2026-07-29"), profile());
    expect(profileFromInvoice(seeded)).toEqual(profile());
  });

  it("takes the seller, not the client", () => {
    const invoice: Invoice = {
      ...emptyInvoice("2026-07-15", "2026-07-29"),
      seller: profile().seller,
      client: { name: "Acme", address: "", vatNumber: "", email: "", country: "" },
    };
    expect(profileFromInvoice(invoice).seller.name).toBe("Weld Corporation BV");
  });

  it("omits the logo key when the invoice has none", () => {
    expect("logoDataUrl" in profileFromInvoice(emptyInvoice("2026-07-15", "2026-07-29"))).toBe(false);
  });

  it("produces something isBusinessProfile accepts", () => {
    expect(isBusinessProfile(profileFromInvoice(emptyInvoice("2026-07-15", "2026-07-29")))).toBe(true);
  });
});
