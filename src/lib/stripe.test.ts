import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStripeCustomers,
  isStripeCursor,
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

describe("isStripeCursor", () => {
  it("accepts a Stripe object id", () => {
    expect(isStripeCursor("cus_ABC123")).toBe(true);
    expect(isStripeCursor("prod_ABC123")).toBe(true);
  });

  it("rejects anything that isn't one — cursors come back off the client", () => {
    expect(isStripeCursor("")).toBe(false);
    expect(isStripeCursor(null)).toBe(false);
    expect(isStripeCursor(42)).toBe(false);
    expect(isStripeCursor("cus_1&limit=999")).toBe(false);
    expect(isStripeCursor("../../admin")).toBe(false);
    expect(isStripeCursor("a".repeat(256))).toBe(false);
  });
});

/**
 * Pagination is the part with a bug worth pinning: a cap that always restarts
 * at the beginning is not a batch size, it's a ceiling — everything past it is
 * unreachable no matter how often you retry.
 */
describe("fetchStripeCustomers pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A Stripe list response of `count` customers, ids prefixed by `page`. */
  const page = (prefix: string, count: number, hasMore: boolean) => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: Array.from({ length: count }, (_, i) => ({
        id: `cus_${prefix}${i}`,
        name: `Customer ${prefix}${i}`,
      })),
      has_more: hasMore,
    }),
  });

  it("returns no cursor when Stripe says there is nothing more", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(page("a", 2, false)),
    );

    const result = await fetchStripeCustomers("rk_test_abc");
    expect(result.customers).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("returns the last id as a cursor when it stops on the page cap", async () => {
    // Always more: 5 pages of 100 exhausts MAX_PAGES with rows left behind.
    const fetchMock = vi.fn().mockResolvedValue(page("a", 100, true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchStripeCustomers("rk_test_abc");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.customers).toHaveLength(500);
    expect(result.nextCursor).toBe("cus_a99");
  });

  it("resumes after the cursor it is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(page("b", 1, false));
    vi.stubGlobal("fetch", fetchMock);

    await fetchStripeCustomers("rk_test_abc", "cus_a99");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("starting_after=cus_a99");
  });

  it("takes the cursor from the raw row, not the mapped ones", async () => {
    // The last customer of the batch has neither name nor email, so it is
    // dropped from the result — but resuming after the *previous* row would
    // fetch it again forever.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            ...Array.from({ length: 99 }, (_, i) => ({
              id: `cus_x${i}`,
              name: `Customer ${i}`,
            })),
            { id: "cus_nameless" },
          ],
          has_more: true,
        }),
      }),
    );

    const result = await fetchStripeCustomers("rk_test_abc");
    expect(result.customers).toHaveLength(99 * 5);
    expect(result.nextCursor).toBe("cus_nameless");
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
