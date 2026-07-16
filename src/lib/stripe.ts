/**
 * Stripe import (v0.3): read customers and products with a user-pasted
 * restricted key.
 *
 * Two rules govern this file:
 *
 * 1. **The key is used, never kept.** It arrives with the request, makes the
 *    list calls, and is gone — no column, no log line, no error message
 *    carries it. That is what makes "paste your key" acceptable on a hosted
 *    multi-tenant app: there is nothing to leak. `STRIPE_RESTRICTED_KEY` in
 *    the environment is the self-host convenience default only.
 * 2. **Restricted, read-only keys only** (`rk_…`). A secret key (`sk_…`) can
 *    move money; refusing its shape outright means a user who pastes the
 *    wrong key gets told to make a safer one instead of us quietly holding
 *    god-mode credentials for a request.
 *
 * A `fetch` client rather than the Stripe SDK: we call two list endpoints.
 */

import "server-only";
import type { Party } from "./types";

const STRIPE_API = "https://api.stripe.com/v1";

/** 100 per page (Stripe's max) × 5 pages. Truncation is reported, not silent. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

const KEY_SHAPE = /^rk_(live|test)_[A-Za-z0-9]+$/;

/** Restricted-key shape only — see the module comment for why sk_ is refused. */
export function isStripeKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value) && value.length <= 200;
}

/** The self-hoster's env-configured key, if present and shaped like one. */
export function serverStripeKey(): string | null {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  return key && isStripeKeyShape(key) ? key : null;
}

/* ---------------------------------------------------------------- fetching */

interface StripePage<T> {
  data: T[];
  has_more: boolean;
}

/**
 * Fetch every page of a Stripe list endpoint, up to the page cap.
 * Throws with a user-safe message on any non-2xx; the response detail goes to
 * the server log (it can describe the key's permissions — not for clients).
 */
async function listAll<T extends { id: string }>(
  key: string,
  path: string,
  params: Record<string, string>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const search = new URLSearchParams({
      ...params,
      limit: String(PAGE_SIZE),
    });
    if (startingAfter) search.set("starting_after", startingAfter);

    const response = await fetch(`${STRIPE_API}${path}?${search}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (response.status === 401 || response.status === 403) {
      console.error(
        `Stripe refused ${path} (${response.status}): ${await response.text()}`,
      );
      throw new Error(
        "Stripe rejected the key — check it is a restricted key with read access to Customers and Products.",
      );
    }
    if (!response.ok) {
      console.error(
        `Stripe ${path} failed (${response.status}): ${await response.text()}`,
      );
      throw new Error(`Stripe answered ${response.status} — try again.`);
    }

    const body = (await response.json()) as StripePage<T>;
    rows.push(...body.data);
    if (!body.has_more) return { rows, truncated: false };
    startingAfter = body.data[body.data.length - 1]?.id ?? null;
    if (!startingAfter) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

/* -------------------------------------------------------------- customers */

interface StripeAddress {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface StripeCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  address?: StripeAddress | null;
}

export interface ImportedCustomer {
  stripeCustomerId: string;
  party: Party;
}

/**
 * A Stripe customer as a `Party`. Pure and exported for tests.
 *
 * Returns null for customers with neither name nor email — a client needs an
 * identity to be saved under. VAT numbers are deliberately not imported:
 * Stripe keeps them in a separate tax-ids resource that many restricted keys
 * can't read, and a failing expand would sink the whole import. The field
 * stays editable on the client afterwards.
 */
export function partyFromStripeCustomer(
  customer: StripeCustomer,
): Party | null {
  const name = customer.name?.trim() || customer.email?.trim() || "";
  if (!name) return null;

  const a = customer.address ?? {};
  const cityLine = [a.postal_code, a.city].filter(Boolean).join(" ");
  const address = [a.line1, a.line2, cityLine, a.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n");

  return {
    name,
    address,
    vatNumber: "",
    email: customer.email?.trim() ?? "",
    country: a.country?.trim() ?? "",
  };
}

export async function fetchStripeCustomers(
  key: string,
): Promise<{ customers: ImportedCustomer[]; truncated: boolean }> {
  const { rows, truncated } = await listAll<StripeCustomer>(
    key,
    "/customers",
    {},
  );

  const customers: ImportedCustomer[] = [];
  for (const row of rows) {
    const party = partyFromStripeCustomer(row);
    if (party) customers.push({ stripeCustomerId: row.id, party });
  }
  return { customers, truncated };
}

/* --------------------------------------------------------------- products */

interface StripePrice {
  id: string;
  unit_amount?: number | null;
  currency?: string | null;
}

export interface StripeProduct {
  id: string;
  name?: string | null;
  /** A string id unless expanded; we request `expand[]=data.default_price`. */
  default_price?: string | StripePrice | null;
}

export interface ImportedItem {
  stripeProductId: string;
  stripePriceId: string;
  description: string;
  unitPriceCents: number;
  currency: string;
}

/**
 * A Stripe product as a saved line item. Pure and exported for tests.
 * Null when there is nothing usable: no name, no expanded default price, or a
 * metered/tiered price without a plain `unit_amount`.
 */
export function itemFromStripeProduct(
  product: StripeProduct,
): ImportedItem | null {
  const description = product.name?.trim();
  const price = product.default_price;
  if (!description || !price || typeof price === "string") return null;
  if (typeof price.unit_amount !== "number" || !price.currency) return null;

  return {
    stripeProductId: product.id,
    stripePriceId: price.id,
    description,
    unitPriceCents: price.unit_amount,
    currency: price.currency.toUpperCase(),
  };
}

export async function fetchStripeProducts(
  key: string,
): Promise<{ items: ImportedItem[]; truncated: boolean }> {
  const { rows, truncated } = await listAll<StripeProduct>(key, "/products", {
    active: "true",
    "expand[]": "data.default_price",
  });

  const items: ImportedItem[] = [];
  for (const row of rows) {
    const item = itemFromStripeProduct(row);
    if (item) items.push(item);
  }
  return { items, truncated };
}
