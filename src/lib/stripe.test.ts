import { describe, expect, it } from "vitest";
import {
  isStripeKeyShape,
  itemFromStripeProduct,
  partyFromStripeCustomer,
} from "./stripe";

describe("isStripeKeyShape", () => {
  it("accepts restricted keys, live and test", () => {
    expect(isStripeKeyShape("rk_live_abc123DEF")).toBe(true);
    expect(isStripeKeyShape("rk_test_abc123DEF")).toBe(true);
  });

  it("refuses secret and publishable keys — a wrong paste must not work", () => {
    expect(isStripeKeyShape("sk_live_abc123DEF")).toBe(false);
    expect(isStripeKeyShape("sk_test_abc123DEF")).toBe(false);
    expect(isStripeKeyShape("pk_live_abc123DEF")).toBe(false);
    expect(isStripeKeyShape("")).toBe(false);
    expect(isStripeKeyShape("rk_live_" + "a".repeat(300))).toBe(false);
  });
});

describe("partyFromStripeCustomer", () => {
  it("maps name, email, and a multi-line address", () => {
    const party = partyFromStripeCustomer({
      id: "cus_1",
      name: "Acme Corp",
      email: "ap@acme.example",
      address: {
        line1: "1 Market Street",
        line2: "Floor 2",
        postal_code: "D01 F5P2",
        city: "Dublin",
        country: "IE",
      },
    });
    expect(party).toEqual({
      name: "Acme Corp",
      address: "1 Market Street\nFloor 2\nD01 F5P2 Dublin",
      vatNumber: "",
      email: "ap@acme.example",
      country: "IE",
    });
  });

  it("falls back to the email as the name — a client needs an identity", () => {
    const party = partyFromStripeCustomer({ id: "cus_2", email: "x@y.example" });
    expect(party?.name).toBe("x@y.example");
  });

  it("skips customers with neither name nor email", () => {
    expect(partyFromStripeCustomer({ id: "cus_3" })).toBeNull();
    expect(partyFromStripeCustomer({ id: "cus_4", name: "  " })).toBeNull();
  });

  it("copes with a missing address", () => {
    const party = partyFromStripeCustomer({ id: "cus_5", name: "Solo" });
    expect(party?.address).toBe("");
    expect(party?.country).toBe("");
  });
});

describe("itemFromStripeProduct", () => {
  it("maps a product with an expanded default price", () => {
    const item = itemFromStripeProduct({
      id: "prod_1",
      name: "Consulting (hours)",
      default_price: { id: "price_1", unit_amount: 9500, currency: "eur" },
    });
    expect(item).toEqual({
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
      description: "Consulting (hours)",
      unitPriceCents: 9500,
      currency: "EUR",
    });
  });

  it("skips products without a usable price", () => {
    // Not expanded — a string id has no amount to import.
    expect(
      itemFromStripeProduct({
        id: "prod_2",
        name: "X",
        default_price: "price_2",
      }),
    ).toBeNull();
    // Metered/tiered prices have no flat unit_amount.
    expect(
      itemFromStripeProduct({
        id: "prod_3",
        name: "X",
        default_price: { id: "price_3", unit_amount: null, currency: "eur" },
      }),
    ).toBeNull();
    expect(itemFromStripeProduct({ id: "prod_4", name: "X" })).toBeNull();
    expect(
      itemFromStripeProduct({
        id: "prod_5",
        default_price: { id: "price_5", unit_amount: 100, currency: "eur" },
      }),
    ).toBeNull();
  });
});
