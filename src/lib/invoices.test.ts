import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ownedBy, ownedInvoice, isUniqueViolation } from "@/lib/invoices";

/**
 * Tenant isolation, guarded two ways.
 *
 * The design's one hard security rule is that every workspace query is scoped
 * by `user_id`. These tests check both halves of that: the scope helpers really
 * do emit a `user_id` predicate, and no query in `invoices.ts` is written
 * without one. Rendering SQL needs a dialect but no connection, so this runs in
 * plain Node with no database.
 */
const dialect = new PgDialect();

function render(chunk: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return dialect.sqlToQuery(chunk);
}

describe("ownedBy", () => {
  it("filters on user_id, with the id as a bound parameter", () => {
    const { sql, params } = render(ownedBy("user_1"));
    expect(sql).toContain('"user_id"');
    expect(params).toEqual(["user_1"]);
  });
});

describe("ownedInvoice", () => {
  it("filters on both the row id and the owner", () => {
    const { sql, params } = render(ownedInvoice("user_1", "invoice_1")!);
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"id"');
    expect(sql).toMatch(/and/i);
    expect(params).toEqual(["invoice_1", "user_1"]);
  });

  it("never matches on id alone — the owner is not optional", () => {
    const { params } = render(ownedInvoice("user_1", "invoice_1")!);
    expect(params).toContain("user_1");
  });
});

describe("isUniqueViolation", () => {
  it("recognises Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("finds the code through Drizzle's wrapper, which puts it on `cause`", () => {
    // The shape Drizzle + the Neon driver actually throw: a bare Error whose
    // own `code` is undefined, wrapping the NeonDbError that carries it. Only
    // checking the outer object silently misses every duplicate number.
    const wrapped = Object.assign(new Error("Failed query: update ..."), {
      cause: Object.assign(new Error("duplicate key value"), {
        code: "23505",
        constraint: "invoices_user_number_idx",
      }),
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("ignores a wrapped error that is not a unique violation", () => {
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("undefined table"), { code: "42P01" }),
    });
    expect(isUniqueViolation(wrapped)).toBe(false);
  });

  it("terminates on a self-referencing cause chain", () => {
    const loop = new Error("loop") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isUniqueViolation(loop)).toBe(false);
  });
});

describe("the invoices repository as written", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./invoices.ts", import.meta.url)),
    "utf8",
  );

  it("scopes every query by owner", () => {
    // Each `.where(` in this module must hand off to a scope helper. This is a
    // source check, not a type check, because the failure it guards against is
    // someone writing `.where(eq(invoices.id, id))` and shipping a data leak.
    const clauses = source.match(/\.where\([\s\S]{0,80}/g) ?? [];
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause).toMatch(/ownedBy\(|ownedInvoice\(/);
    }
  });

  it("takes a userId on every exported query function", () => {
    const exported =
      source.match(/export async function (\w+)\(\s*([\s\S]{0,40})/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    for (const fn of exported) {
      expect(fn).toContain("userId");
    }
  });
});
