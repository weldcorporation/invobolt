/**
 * Drizzle schema for workspace mode (v0.2).
 *
 * This is dormant until workspace mode is enabled (see `WORKSPACE_ENABLED` and
 * `src/lib/db/index.ts`). Instant mode never imports it. See
 * `docs/workspace-mode-design.md` for the rationale behind storing the invoice
 * as a JSON document with only queried columns lifted out.
 *
 * Authentication is handled by **Neon Auth** (Managed Better Auth): user records
 * live in the Neon-managed `neon_auth` schema, synced automatically — this app
 * does not own a users table and does not migrate auth tables. `user_id` columns
 * below hold the Neon Auth user id (a string). We deliberately do NOT add a hard
 * cross-schema foreign key to the synced table: it is managed by Neon and may lag
 * a request, so we scope by `user_id` in queries and join to `neon_auth.users_sync`
 * only when we need the email/name for display.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  date,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { BusinessProfile, Invoice, Party } from "@/lib/types";
import type { Cadence } from "@/lib/cadence";
import type { InvoiceStatus } from "@/lib/status";

/**
 * The seller defaults a user's new invoices are pre-filled from — the
 * server-side home for the `BusinessProfile` instant mode keeps in
 * localStorage, seeded by the one-time import (see `docs/workspace-mode-design.md`).
 *
 * `user_id` is the primary key rather than a column with an index: a user has
 * exactly one profile, and making that the key means the upsert has an obvious
 * conflict target and a second row is unrepresentable.
 */
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  profile: jsonb("profile").notNull().$type<BusinessProfile>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Saved clients — reusable bill-to parties, owner-scoped by Neon Auth user id.
 *
 * Two fields are lifted out of the `party` document, for the same reason the
 * invoice columns are — they're what we sort and index on:
 *
 * - `name` is the display name, spelled however the user typed it.
 * - `nameKey` is `name` lowercased: the key the unique index dedupes on, so
 *   "Acme Corp" and "acme corp" are one client. It's a stored column rather
 *   than a `lower(name)` index expression because a plain column can be an
 *   `ON CONFLICT` target — which is what makes "save this client" a single
 *   atomic upsert instead of a read-then-write race that duplicates Acme.
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    party: jsonb("party").notNull().$type<Party>(),
    // Set by Stripe import (v0.3). The partial unique index makes a re-import
    // an upsert keyed on the Stripe id, so a customer renamed in Stripe
    // updates the same client instead of resurrecting the old name as a
    // second row. Null for clients saved by hand.
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("clients_user_id_idx").on(t.userId),
    uniqueIndex("clients_user_name_idx").on(t.userId, t.nameKey),
    uniqueIndex("clients_user_stripe_idx")
      .on(t.userId, t.stripeCustomerId)
      .where(sql`${t.stripeCustomerId} is not null`),
  ],
);

/**
 * Invoice status. The type and its state machine live in `lib/status.ts` — the
 * domain owns the rule, the schema just annotates the column with it — so
 * client components can import the type without pulling Drizzle into their
 * bundle. `overdue` is derived (sent + past due), never stored.
 */
export type { InvoiceStatus };

/**
 * Invoices. The full `Invoice` object lives in `document`; the lifted columns
 * exist only for listing, sorting, filtering, and uniqueness. `totalCents` is a
 * cache recomputed from `document` via `computeTotals` on every write — the
 * document + calc.ts remain the source of truth.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    number: text("number").notNull(),
    status: text("status").notNull().default("draft").$type<InvoiceStatus>(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    currency: text("currency").notNull(),
    totalCents: integer("total_cents").notNull(),
    document: jsonb("document").notNull().$type<Invoice>(),
    shareToken: text("share_token").unique(),
    // A sender-provided https URL rendered as "Pay now" on /i/[token] and in
    // the invoice email. A lifted column rather than a document field on
    // purpose: it is a workspace affordance, and the shared `Invoice` type is
    // instant mode's too (see docs/v0.3-design.md).
    paymentLinkUrl: text("payment_link_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_user_number_idx").on(t.userId, t.number),
    index("invoices_user_status_idx").on(t.userId, t.status),
  ],
);

/**
 * Saved line items (v0.3) — reusable descriptions with a unit price, born
 * from Stripe product import. Prices are stored in minor units (Stripe's
 * shape, and exact); the picker converts to the document's decimal form.
 * `vatRate` is nullable because Stripe products don't carry one — the picker
 * falls back to the form's default.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    description: text("description").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    /** ISO 4217, uppercase — compared against the invoice's currency on pick. */
    currency: text("currency").notNull(),
    vatRate: doublePrecision("vat_rate"),
    stripeProductId: text("stripe_product_id"),
    // The price id, not just the product id, keys the re-import upsert: a
    // product whose price changed in Stripe is a *new* price object, and a
    // new saved item is the honest representation of that.
    stripePriceId: text("stripe_price_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("items_user_id_idx").on(t.userId),
    uniqueIndex("items_user_price_idx")
      .on(t.userId, t.stripePriceId)
      .where(sql`${t.stripePriceId} is not null`),
  ],
);

/**
 * One row per invoice email sent (v0.3). This is the audit trail *and* the
 * send rate limiter: "how many emails did this user send in the last 24h" is
 * one indexed count, which is why v0.2's objection to a limiter (serverless
 * needs a shared store) doesn't apply — the shared store is the database the
 * sends are already rows in.
 *
 * No FK to `invoices` on purpose: deleting an invoice must not erase the
 * evidence it was emailed, nor refund the day's sending quota.
 */
export const invoiceEmails = pgTable(
  "invoice_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    toEmail: text("to_email").notNull(),
    /** The provider's message id (Resend), for tracing a delivery complaint. */
    providerId: text("provider_id"),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("invoice_emails_user_sent_idx").on(t.userId, t.sentAt)],
);

/**
 * Recurring-invoice schedules (v0.3). `document` is the template the
 * generator copies; its dates and number are recomputed per generation
 * (issue = the scheduled date, due = issue + `paymentTermsDays`, number =
 * next in the user's sequence) — literal values in the template would be
 * stale by the second run.
 *
 * `nextIssueDate` is both the trigger and the claim: a schedule is due when
 * it is ≤ today, and the cron advances it atomically in the UPDATE's WHERE
 * clause so two overlapping runs cannot both generate the same period (see
 * lib/recurring.ts).
 */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    document: jsonb("document").notNull().$type<Invoice>(),
    cadence: text("cadence").notNull().$type<Cadence>(),
    nextIssueDate: date("next_issue_date").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull().default(14),
    // Auto-send pushes each generated draft through the same send path the
    // editor uses, subject to the same daily cap. Off unless email works.
    autoSend: boolean("auto_send").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("schedules_user_id_idx").on(t.userId),
    // The cron's scan: active schedules ordered/filtered by due date.
    index("schedules_due_idx").on(t.active, t.nextIssueDate),
  ],
);

export type ClientRow = typeof clients.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type InvoiceEmailRow = typeof invoiceEmails.$inferSelect;
export type ScheduleRow = typeof schedules.$inferSelect;
