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

/**
 * How long to wait on Stripe before giving up. Same reasoning as the email
 * client's bound: a stalled connection otherwise holds the Server Action open
 * until the platform kills it, and the user just watches a spinner.
 */
const REQUEST_TIMEOUT_MS = 10_000;

const KEY_SHAPE = /^rk_(live|test)_[A-Za-z0-9]+$/;

/** Stripe object ids — what a pagination cursor is. */
const CURSOR_SHAPE = /^[A-Za-z0-9_]{1,255}$/;

/** Restricted-key shape only — see the module comment for why sk_ is refused. */
export function isStripeKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value) && value.length <= 200;
}

/**
 * Whether a value could be a cursor we handed out. Cursors round-trip through
 * the browser between batches, so they come back as untrusted input.
 */
export function isStripeCursor(value: unknown): value is string {
  return typeof value === "string" && CURSOR_SHAPE.test(value);
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
 * Fetch up to `MAX_PAGES` pages of a Stripe list endpoint, starting after
 * `after`. Throws with a user-safe message on any non-2xx; the response detail
 * goes to the server log (it can describe the key's permissions — not for
 * clients).
 *
 * `nextCursor` is non-null exactly when Stripe has more rows than this batch
 * took. It is the caller's way back in: handing it to the next call resumes
 * where this one stopped. Without it the cap would not be a batch size but a
 * ceiling — every run would re-fetch the same first rows and an account with
 * more than `PAGE_SIZE * MAX_PAGES` records could never import the rest.
 */
async function listBatch<T extends { id: string }>(
  key: string,
  path: string,
  params: Record<string, string>,
  after: string | null,
): Promise<{ rows: T[]; nextCursor: string | null }> {
  const rows: T[] = [];
  let startingAfter: string | null = after;

  for (let page = 0; page < MAX_PAGES; page++) {
    const search = new URLSearchParams({
      ...params,
      limit: String(PAGE_SIZE),
    });
    if (startingAfter) search.set("starting_after", startingAfter);

    // An abort throws, which is already the failure path below — a timeout
    // needs no special casing, only a bound.
    const response = await fetch(`${STRIPE_API}${path}?${search}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    if (!body.has_more) return { rows, nextCursor: null };

    // The cursor is the last *raw* id, taken before any mapping drops rows —
    // resuming after a row we skipped would silently lose everything between.
    startingAfter = body.data[body.data.length - 1]?.id ?? null;
    if (!startingAfter) return { rows, nextCursor: null };
  }

  return { rows, nextCursor: startingAfter };
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
  after: string | null = null,
): Promise<{ customers: ImportedCustomer[]; nextCursor: string | null }> {
  const { rows, nextCursor } = await listBatch<StripeCustomer>(
    key,
    "/customers",
    {},
    after,
  );

  const customers: ImportedCustomer[] = [];
  for (const row of rows) {
    const party = partyFromStripeCustomer(row);
    if (party) customers.push({ stripeCustomerId: row.id, party });
  }
  return { customers, nextCursor };
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
  after: string | null = null,
): Promise<{ items: ImportedItem[]; nextCursor: string | null }> {
  const { rows, nextCursor } = await listBatch<StripeProduct>(
    key,
    "/products",
    { active: "true", "expand[]": "data.default_price" },
    after,
  );

  const items: ImportedItem[] = [];
  for (const row of rows) {
    const item = itemFromStripeProduct(row);
    if (item) items.push(item);
  }
  return { items, nextCursor };
}
