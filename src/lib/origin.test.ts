import { describe, expect, it } from "vitest";
import { originFromHeaders } from "./origin";

function headers(entries: Record<string, string>): {
  get(name: string): string | null;
} {
  const map = new Map(Object.entries(entries));
  return { get: (name) => map.get(name) ?? null };
}

describe("originFromHeaders", () => {
  it("defaults to https when no proto is forwarded", () => {
    expect(originFromHeaders(headers({ host: "invobolt.example" }))).toBe(
      "https://invobolt.example",
    );
  });

  it("honours x-forwarded-proto http (local dev)", () => {
    expect(
      originFromHeaders(
        headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
      ),
    ).toBe("http://localhost:3000");
  });

  it("takes the first proto of a multi-hop chain, and never a junk one", () => {
    expect(
      originFromHeaders(
        headers({ host: "a.example", "x-forwarded-proto": "https, http" }),
      ),
    ).toBe("https://a.example");
    expect(
      originFromHeaders(
        headers({ host: "a.example", "x-forwarded-proto": "gopher" }),
      ),
    ).toBe("https://a.example");
  });

  it("yields no origin — rather than a poisoned link — for a junk host", () => {
    expect(originFromHeaders(headers({}))).toBeNull();
    // This value ends up inside an email we send; a host that could smuggle
    // in a path or credentials must fail closed.
    expect(
      originFromHeaders(headers({ host: "evil.example/phish?x=" })),
    ).toBeNull();
    expect(
      originFromHeaders(headers({ host: "user:pass@evil.example" })),
    ).toBeNull();
  });
});
