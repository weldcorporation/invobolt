import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ownedBy, ownedInvoice } from "@/lib/invoices";

/**
 * The invoice scope helpers really do emit a `user_id` predicate. Rendering SQL
 * needs a dialect but no connection, so this runs in plain Node with no
 * database.
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

// `isUniqueViolation` moved to `pg-errors.ts` (both repositories lean on a
// unique index now); its tests live in `pg-errors.test.ts`. The source-level
// guard that no query here is written without an owner scope lives in
// `tenant-isolation.test.ts`, which applies it to every repository.
