import { describe, it, expect } from "vitest";
import {
  MAX_PARTY_FIELD_CHARS,
  clientNameKey,
  isParty,
  normalizeParty,
  validateClientParty,
} from "@/lib/party";
import { isUuid } from "@/lib/uuid";
import type { Party } from "@/lib/types";

function party(partial: Partial<Party> = {}): Party {
  return {
    name: "Acme Corp",
    address: "1 Market Street\nDublin",
    vatNumber: "IE1234567AB",
    email: "ap@acme.example",
    country: "Ireland",
    ...partial,
  };
}

describe("isParty", () => {
  it("accepts a well-formed party", () => {
    expect(isParty(party())).toBe(true);
  });

  it("rejects anything that isn't one", () => {
    expect(isParty(null)).toBe(false);
    expect(isParty(undefined)).toBe(false);
    expect(isParty("Acme")).toBe(false);
    expect(isParty([])).toBe(false);
    expect(isParty({})).toBe(false);
  });

  it("rejects a party with a missing or non-string field", () => {
    const { email: _email, ...missing } = party();
    expect(isParty(missing)).toBe(false);
    expect(isParty({ ...party(), name: 42 })).toBe(false);
    expect(isParty({ ...party(), address: null })).toBe(false);
  });
});

describe("normalizeParty", () => {
  it("trims every field", () => {
    expect(normalizeParty(party({ name: "  Acme Corp  ", email: " a@b.c " }))).toEqual(
      party({ name: "Acme Corp", email: "a@b.c" }),
    );
  });

  it("drops keys that aren't a Party's, so extras can't be smuggled into jsonb", () => {
    const smuggled = { ...party(), isAdmin: true, notes: "x" } as Party;
    expect(Object.keys(normalizeParty(smuggled)).sort()).toEqual([
      "address",
      "country",
      "email",
      "name",
      "vatNumber",
    ]);
  });

  it("makes ' Acme ' and 'Acme' the same client under the unique index", () => {
    expect(normalizeParty(party({ name: " Acme " })).name).toBe(
      normalizeParty(party({ name: "Acme" })).name,
    );
  });
});

describe("clientNameKey", () => {
  it("folds case, so 'Acme Corp' and 'acme corp' are one client", () => {
    expect(clientNameKey("Acme Corp")).toBe(clientNameKey("acme corp"));
    expect(clientNameKey("ACME CORP")).toBe("acme corp");
  });

  it("ignores surrounding whitespace", () => {
    expect(clientNameKey("  Acme  ")).toBe("acme");
  });

  it("keeps genuinely different names apart", () => {
    expect(clientNameKey("Acme")).not.toBe(clientNameKey("Acme Ltd"));
  });

  it("does not fold locale-sensitively — the key can't depend on the server's locale", () => {
    // toLocaleLowerCase("tr") would turn "I" into a dotless "ı".
    expect(clientNameKey("ACME I")).toBe("acme i");
  });
});

describe("validateClientParty", () => {
  it("passes a normal client", () => {
    expect(validateClientParty(party())).toEqual([]);
  });

  it("requires a name — it's the NOT NULL column and the dedup key", () => {
    expect(validateClientParty(party({ name: "" }))).toContain(
      "Give this client a name before saving it.",
    );
    expect(validateClientParty(party({ name: "   " }))).toContain(
      "Give this client a name before saving it.",
    );
  });

  it("allows every other field to be blank", () => {
    expect(
      validateClientParty({
        name: "Acme",
        address: "",
        vatNumber: "",
        email: "",
        country: "",
      }),
    ).toEqual([]);
  });

  it("bounds field length rather than trusting the client", () => {
    const long = "x".repeat(MAX_PARTY_FIELD_CHARS + 1);
    expect(validateClientParty(party({ address: long }))).toContain(
      "That address is too long.",
    );
    expect(validateClientParty(party({ vatNumber: long }))).toContain(
      "That VAT number is too long.",
    );
  });

  it("accepts a field exactly at the cap", () => {
    expect(validateClientParty(party({ address: "x".repeat(MAX_PARTY_FIELD_CHARS) }))).toEqual([]);
  });
});

describe("isUuid", () => {
  it("accepts a real uuid, in either case", () => {
    expect(isUuid("2d8ac185-8c4f-45fe-874d-d1d361d655b8")).toBe(true);
    expect(isUuid("2D8AC185-8C4F-45FE-874D-D1D361D655B8")).toBe(true);
  });

  it("rejects anything Postgres would choke on", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("'; drop table invoices; --")).toBe(false);
    expect(isUuid("2d8ac185-8c4f-45fe-874d")).toBe(false);
    expect(isUuid("2d8ac185-8c4f-45fe-874d-d1d361d655b8 ")).toBe(false);
    expect(isUuid("g2d8ac185-8c4f-45fe-874d-d1d361d655b")).toBe(false);
  });
});
