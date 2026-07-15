import { describe, it, expect } from "vitest";
import {
  round2,
  lineNet,
  effectiveRate,
  computeTotals,
} from "@/lib/calc";
import type { Invoice, LineItem, VatMode } from "@/lib/types";

/** Build a LineItem with sensible defaults so tests only state what matters. */
function item(partial: Partial<LineItem> = {}): LineItem {
  return {
    id: "li_test",
    description: "Item",
    quantity: 1,
    unitPrice: 100,
    vatRate: 21,
    ...partial,
  };
}

/** Build an Invoice whose only meaningful fields for calc are items/vat/discount. */
function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    template: "modern",
    locale: "en",
    currency: "EUR",
    seller: {
      name: "",
      address: "",
      vatNumber: "",
      email: "",
      country: "",
    },
    client: {
      name: "",
      address: "",
      vatNumber: "",
      email: "",
      country: "",
    },
    number: "1",
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    items: [],
    vatMode: "standard",
    discountPercent: 0,
    notes: "",
    paymentTerms: "",
    accentColor: "#000000",
    ...partial,
  };
}

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });

  it("rounds half up, defeating binary-float noise (1.005 → 1.01)", () => {
    // Naive Math.round(1.005 * 100) / 100 yields 1.00 because 1.005 can't be
    // represented exactly; the Number.EPSILON nudge fixes it.
    expect(round2(1.005)).toBe(1.01);
  });

  it("leaves already-rounded values untouched", () => {
    expect(round2(42)).toBe(42);
    expect(round2(0)).toBe(0);
  });

  it("handles negative values", () => {
    expect(round2(-1.235)).toBe(-1.23);
  });
});

describe("lineNet", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineNet(item({ quantity: 3, unitPrice: 25 }))).toBe(75);
  });

  it("treats a non-finite quantity as 0", () => {
    expect(lineNet(item({ quantity: NaN, unitPrice: 25 }))).toBe(0);
    expect(lineNet(item({ quantity: Infinity, unitPrice: 25 }))).toBe(0);
  });

  it("treats a non-finite unit price as 0", () => {
    expect(lineNet(item({ quantity: 3, unitPrice: NaN }))).toBe(0);
  });

  it("supports fractional quantities", () => {
    expect(lineNet(item({ quantity: 1.5, unitPrice: 10 }))).toBe(15);
  });
});

describe("effectiveRate", () => {
  const cases: Array<[VatMode, number, number]> = [
    ["standard", 21, 21],
    ["standard", 9, 9],
    ["reverse", 21, 0],
    ["exempt", 21, 0],
  ];

  it.each(cases)("mode %s with rate %d → %d", (mode, rate, expected) => {
    expect(effectiveRate(rate, mode)).toBe(expected);
  });

  it("treats a non-finite rate as 0 in standard mode", () => {
    expect(effectiveRate(NaN, "standard")).toBe(0);
  });
});

describe("computeTotals", () => {
  it("returns all-zero totals for an empty invoice", () => {
    const t = computeTotals(invoice({ items: [] }));
    expect(t.subtotal).toBe(0);
    expect(t.discount).toBe(0);
    expect(t.netAfterDiscount).toBe(0);
    expect(t.vatBuckets).toEqual([]);
    expect(t.vatTotal).toBe(0);
    expect(t.total).toBe(0);
  });

  it("computes subtotal, VAT and total for a single line", () => {
    const t = computeTotals(
      invoice({ items: [item({ quantity: 1, unitPrice: 1000, vatRate: 21 })] }),
    );
    expect(t.subtotal).toBe(1000);
    expect(t.netAfterDiscount).toBe(1000);
    expect(t.vatBuckets).toEqual([{ rate: 21, base: 1000, vat: 210 }]);
    expect(t.vatTotal).toBe(210);
    expect(t.total).toBe(1210);
  });

  it("groups lines that share a rate into one bucket", () => {
    const t = computeTotals(
      invoice({
        items: [
          item({ quantity: 1, unitPrice: 1800, vatRate: 21 }),
          item({ quantity: 6, unitPrice: 95, vatRate: 21 }),
        ],
      }),
    );
    // 1800 + 570 = 2370 base, 21% = 497.70
    expect(t.subtotal).toBe(2370);
    expect(t.vatBuckets).toEqual([{ rate: 21, base: 2370, vat: 497.7 }]);
    expect(t.total).toBe(2867.7);
  });

  it("splits mixed rates into separate buckets, sorted ascending by rate", () => {
    const t = computeTotals(
      invoice({
        items: [
          item({ quantity: 1, unitPrice: 100, vatRate: 21 }),
          item({ quantity: 1, unitPrice: 100, vatRate: 9 }),
          item({ quantity: 1, unitPrice: 100, vatRate: 0 }),
        ],
      }),
    );
    expect(t.subtotal).toBe(300);
    expect(t.vatBuckets).toEqual([
      { rate: 0, base: 100, vat: 0 },
      { rate: 9, base: 100, vat: 9 },
      { rate: 21, base: 100, vat: 21 },
    ]);
    expect(t.vatTotal).toBe(30);
    expect(t.total).toBe(330);
  });

  it("applies a discount proportionally across every VAT bucket", () => {
    const t = computeTotals(
      invoice({
        discountPercent: 10,
        items: [
          item({ quantity: 1, unitPrice: 200, vatRate: 21 }),
          item({ quantity: 1, unitPrice: 100, vatRate: 9 }),
        ],
      }),
    );
    // subtotal 300, discount 30, net 270, factor 0.9
    expect(t.subtotal).toBe(300);
    expect(t.discount).toBe(30);
    expect(t.netAfterDiscount).toBe(270);
    expect(t.vatBuckets).toEqual([
      { rate: 9, base: 90, vat: 8.1 }, // 100*0.9=90, 9% → 8.1
      { rate: 21, base: 180, vat: 37.8 }, // 200*0.9=180, 21% → 37.8
    ]);
    expect(t.vatTotal).toBe(45.9);
    expect(t.total).toBe(315.9);
  });

  it("clamps a discount above 100% to 100%", () => {
    const t = computeTotals(
      invoice({
        discountPercent: 150,
        items: [item({ quantity: 1, unitPrice: 100, vatRate: 21 })],
      }),
    );
    expect(t.discount).toBe(100);
    expect(t.netAfterDiscount).toBe(0);
    expect(t.vatTotal).toBe(0);
    expect(t.total).toBe(0);
  });

  it("clamps a negative discount to 0%", () => {
    const t = computeTotals(
      invoice({
        discountPercent: -20,
        items: [item({ quantity: 1, unitPrice: 100, vatRate: 21 })],
      }),
    );
    expect(t.discount).toBe(0);
    expect(t.total).toBe(121);
  });

  it("treats a non-finite discount as 0%", () => {
    const t = computeTotals(
      invoice({
        discountPercent: NaN,
        items: [item({ quantity: 1, unitPrice: 100, vatRate: 21 })],
      }),
    );
    expect(t.discount).toBe(0);
    expect(t.total).toBe(121);
  });

  it("zeroes VAT under reverse charge but keeps the taxable base", () => {
    const t = computeTotals(
      invoice({
        vatMode: "reverse",
        items: [
          item({ quantity: 1, unitPrice: 1000, vatRate: 21 }),
          item({ quantity: 1, unitPrice: 500, vatRate: 9 }),
        ],
      }),
    );
    expect(t.subtotal).toBe(1500);
    // Both lines collapse to the single 0% bucket.
    expect(t.vatBuckets).toEqual([{ rate: 0, base: 1500, vat: 0 }]);
    expect(t.vatTotal).toBe(0);
    expect(t.total).toBe(1500);
  });

  it("zeroes VAT when exempt", () => {
    const t = computeTotals(
      invoice({
        vatMode: "exempt",
        items: [item({ quantity: 1, unitPrice: 1000, vatRate: 21 })],
      }),
    );
    expect(t.vatBuckets).toEqual([{ rate: 0, base: 1000, vat: 0 }]);
    expect(t.vatTotal).toBe(0);
    expect(t.total).toBe(1000);
  });

  it("rounds each bucket and the total half-up once at the surface", () => {
    // 3 × 33.33 = 99.99 base; 21% = 20.9979 → 21.00 after round2.
    const t = computeTotals(
      invoice({
        items: [item({ quantity: 3, unitPrice: 33.33, vatRate: 21 })],
      }),
    );
    expect(t.subtotal).toBe(99.99);
    expect(t.vatBuckets).toEqual([{ rate: 21, base: 99.99, vat: 21 }]);
    expect(t.total).toBe(120.99);
  });
});
