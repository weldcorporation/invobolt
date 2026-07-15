import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ownedClient, ownedClients } from "@/lib/clients";

/** The client scope helpers really do emit a `user_id` predicate. */
const dialect = new PgDialect();

function render(chunk: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return dialect.sqlToQuery(chunk);
}

describe("ownedClients", () => {
  it("filters on user_id, with the id as a bound parameter", () => {
    const { sql, params } = render(ownedClients("user_1"));
    expect(sql).toContain('"user_id"');
    expect(params).toEqual(["user_1"]);
  });
});

describe("ownedClient", () => {
  it("filters on both the row id and the owner", () => {
    const { sql, params } = render(ownedClient("user_1", "client_1")!);
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"id"');
    expect(sql).toMatch(/and/i);
    expect(params).toEqual(["client_1", "user_1"]);
  });

  it("never matches on id alone — the owner is not optional", () => {
    const { params } = render(ownedClient("user_1", "client_1")!);
    expect(params).toContain("user_1");
  });
});
