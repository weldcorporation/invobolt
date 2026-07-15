/**
 * Drizzle schema for workspace mode (v0.2).
 *
 * This is dormant until workspace mode is enabled (see `WORKSPACE_ENABLED` and
 * `src/lib/db/index.ts`). Instant mode never imports it. See
 * `docs/workspace-mode-design.md` for the rationale behind storing the invoice
 * as a JSON document with only queried columns lifted out.
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
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Invoice, Party } from "@/lib/types";

/**
 * Users. Column shape is intentionally compatible with the Auth.js Drizzle
 * adapter so PR #2 (auth) can add accounts/sessions/verification_tokens that
 * reference this table without reshaping it.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Auth.js adapter tables. Standard columns expected by @auth/drizzle-adapter.
 * With JWT sessions the `sessions` table stays empty and with magic-link only
 * the `accounts` table stays empty, but the adapter's types require all four to
 * be present, so we define them and wire them explicitly in `src/lib/auth.ts`.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/** Saved clients — reusable bill-to parties, owner-scoped. */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    party: jsonb("party").notNull().$type<Party>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("clients_user_id_idx").on(t.userId)],
);

/** Invoice status. `overdue` is derived (sent + past due), never stored. */
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export type UserRow = typeof users.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
