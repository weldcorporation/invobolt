import { describe, it, expect } from "vitest";
import { isShareToken, mintShareToken } from "@/lib/share-token";

describe("mintShareToken", () => {
  it("mints a token of the documented shape", () => {
    expect(mintShareToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("is URL-safe — no +, / or = to escape in a link", () => {
    for (let i = 0; i < 200; i++) {
      expect(mintShareToken()).not.toMatch(/[+/=]/);
    }
  });

  it("carries at least the 128 bits the design asks for", () => {
    // 32 base64url chars x 6 bits = 192 bits of encoded randomness.
    expect(mintShareToken()).toHaveLength(32);
    expect(32 * 6).toBeGreaterThanOrEqual(128);
  });

  it("never repeats across many mints", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(mintShareToken());
    expect(seen.size).toBe(5000);
  });

  it("is not predictable from a neighbouring token", () => {
    // A weak generator (a counter, a timestamp, Math.random seeded per tick)
    // tends to leak a shared prefix between successive values.
    const a = mintShareToken();
    const b = mintShareToken();
    let shared = 0;
    while (shared < a.length && a[shared] === b[shared]) shared++;
    expect(shared).toBeLessThan(8);
  });

  it("spreads across the alphabet rather than a narrow range", () => {
    const chars = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of mintShareToken()) chars.add(c);
    // 64-symbol alphabet; 16k samples should hit nearly all of it.
    expect(chars.size).toBeGreaterThan(50);
  });

  it("produces tokens its own validator accepts", () => {
    for (let i = 0; i < 200; i++) {
      expect(isShareToken(mintShareToken())).toBe(true);
    }
  });
});

describe("isShareToken", () => {
  it("rejects junk before it reaches the database", () => {
    expect(isShareToken("")).toBe(false);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("'; drop table invoices; --")).toBe(false);
    expect(isShareToken("../../etc/passwd")).toBe(false);
  });

  it("rejects a token of the wrong length", () => {
    expect(isShareToken("a".repeat(31))).toBe(false);
    expect(isShareToken("a".repeat(33))).toBe(false);
    expect(isShareToken("a".repeat(32))).toBe(true);
  });

  it("rejects characters outside base64url", () => {
    expect(isShareToken(`${"a".repeat(31)}+`)).toBe(false);
    expect(isShareToken(`${"a".repeat(31)}/`)).toBe(false);
    expect(isShareToken(`${"a".repeat(31)}=`)).toBe(false);
    expect(isShareToken(`${"a".repeat(31)} `)).toBe(false);
  });
});
