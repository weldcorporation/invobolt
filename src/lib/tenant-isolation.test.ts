import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * The design's one hard security rule, guarded at the source level for every
 * repository module: **every workspace query is scoped by `user_id`**.
 *
 * This is a source check rather than a type check because the failure it guards
 * against — someone writing `.where(eq(invoices.id, id))` and shipping a data
 * leak — type checks perfectly. Add new repositories to the list below; a
 * module that queries owner-scoped rows without appearing here is the gap this
 * is meant to catch, so keep it in step with `lib/`.
 */
const REPOSITORIES = ["invoices.ts", "clients.ts"];

function read(file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
}

describe.each(REPOSITORIES)("%s", (file) => {
  const source = read(file);

  it("scopes every query by owner", () => {
    const clauses = source.match(/\.where\([\s\S]{0,80}/g) ?? [];
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause).toMatch(/owned[A-Za-z]*\(/);
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

  it("derives its scope helpers from userId, not from an id alone", () => {
    const helpers = source.match(/export function owned[A-Za-z]*\([\s\S]{0,120}/g) ?? [];
    expect(helpers.length).toBeGreaterThan(0);
    for (const helper of helpers) {
      expect(helper).toContain("userId");
    }
  });
});
