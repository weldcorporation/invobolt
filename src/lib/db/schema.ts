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

import {
  pgTable,
  text,
  timestamp,
  date,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { BusinessProfile, Invoice, Party } from "@/lib/types";
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

export type ClientRow = typeof clients.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
