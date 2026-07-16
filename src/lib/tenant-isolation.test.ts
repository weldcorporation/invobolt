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
const REPOSITORIES = [
  "invoices.ts",
  "clients.ts",
  "profiles.ts",
  "emails.ts",
  "items.ts",
  "schedules.ts",
];

/**
 * The exceptions, named one by one, with the reason each is safe.
 *
 * This list is the point of the whole test. Every entry is a decision to return
 * rows without checking who is asking, so it should stay short and each line
 * should be arguable on its own in review — a diff that adds to it is the
 * signal to stop and look.
 */
const CAPABILITY_QUERIES: Record<string, string> = {
  getSharedInvoice:
    "public /i/[token] has no session; the 192-bit token IS the capability, " +
    "and share_token is NULL until the owner shares (eq never matches NULL)",
};

/** Scope helpers a query may hand off to: owner checks, plus the above. */
const ALLOWED_SCOPES = /owned[A-Za-z]*\(|byShareToken\(/;

function read(file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
}

/** `export async function foo(` → "foo", with the head of its signature. */
function exportedFunctions(source: string): { name: string; head: string }[] {
  const matches = source.matchAll(
    /export async function (\w+)\(([\s\S]{0,60})/g,
  );
  return [...matches].map((m) => ({ name: m[1], head: m[0] }));
}

describe.each(REPOSITORIES)("%s", (file) => {
  const source = read(file);

  it("scopes every query by owner, or by an allowed capability", () => {
    const clauses = source.match(/\.where\([\s\S]{0,80}/g) ?? [];
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause).toMatch(ALLOWED_SCOPES);
    }
  });

  it("takes a userId on every exported query function bar the listed exceptions", () => {
    const fns = exportedFunctions(source);
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      if (fn.name in CAPABILITY_QUERIES) continue;
      expect(fn.head, `${fn.name} must take a userId`).toContain("userId");
    }
  });

  it("derives its scope helpers from userId, not from an id alone", () => {
    const helpers =
      source.match(/export function owned[A-Za-z]*\([\s\S]{0,120}/g) ?? [];
    expect(helpers.length).toBeGreaterThan(0);
    for (const helper of helpers) {
      expect(helper).toContain("userId");
    }
  });
});

/**
 * The one module allowed to query across tenants: the recurring generator,
 * which runs for the *system* (a cron tick), not a session. It gets its own
 * block rather than an entry above because its exception is the whole file,
 * argued in its module comment — not one function that slipped the rule.
 * Every row it touches carries its own user_id, and everything it does per
 * row goes through the owner-scoped repositories with that id.
 */
describe("recurring.ts — the system actor", () => {
  const source = read("recurring.ts");

  it("scopes every query to the due-schedule scan or the atomic claim", () => {
    const clauses = source.match(/\.where\([\s\S]{0,80}/g) ?? [];
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause).toMatch(/dueSchedules\(|scheduleClaim\(/);
    }
  });

  it("owns up to being the exception, in its own words", () => {
    expect(source).toContain("deliberate exception to per-user scoping");
  });

  it("hands each row back to owner-scoped code by its own user id", () => {
    expect(source).toContain("insertInvoiceWithFreshNumber(schedule.userId");
    expect(source).toContain("sendInvoiceEmailFlow(");
  });
});

describe("the capability exceptions", () => {
  it("are only the ones we have argued for", () => {
    // Fails when someone adds an unscoped query *and* allowlists it without
    // touching this line — which is exactly the diff worth arguing about.
    expect(Object.keys(CAPABILITY_QUERIES)).toEqual(["getSharedInvoice"]);
  });

  it("each still exist, so a stale exception can't silently widen the rule", () => {
    const sources = REPOSITORIES.map(read).join("\n");
    for (const name of Object.keys(CAPABILITY_QUERIES)) {
      expect(sources).toContain(`export async function ${name}(`);
    }
  });

  it("each carry a reason", () => {
    for (const [name, why] of Object.entries(CAPABILITY_QUERIES)) {
      expect(why.length, `${name} needs a reason`).toBeGreaterThan(20);
    }
  });
});
