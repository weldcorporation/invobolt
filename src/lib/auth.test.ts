import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The cookie policy the magic-link flow depends on.
 *
 * `sameSite: "lax"` looks like a weaker choice than the SDK's `strict` default,
 * so it is the kind of line a security pass "hardens" — and the breakage it
 * causes is silent and remote: sign-in still sends the email, the token still
 * verifies, the user just lands back on the login page. Nothing in the type
 * system or the build catches it. This test does, and says why.
 */
const createNeonAuth = vi.fn((_config: unknown) => ({}) as never);

vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: (config: unknown) => createNeonAuth(config),
}));

/** Fresh module each time — `getAuth` caches its instance after the first call. */
async function freshGetAuth() {
  vi.resetModules();
  return (await import("@/lib/auth")).getAuth;
}

describe("getAuth", () => {
  beforeEach(() => {
    createNeonAuth.mockClear();
    process.env.NEON_AUTH_BASE_URL = "https://example.neonauth.test";
    process.env.NEON_AUTH_COOKIE_SECRET = "x".repeat(32);
  });

  it("sets SameSite=Lax, without which magic links land you back on sign-in", async () => {
    const getAuth = await freshGetAuth();
    getAuth();

    // Clicking a link in your mail client is a top-level cross-site navigation.
    // `strict` withholds the session cookie for that whole navigation chain —
    // including the post-verify redirect to /app — so the proxy sees no session.
    expect(createNeonAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        cookies: expect.objectContaining({ sameSite: "lax" }),
      }),
    );
  });

  it("passes the cookie secret and base URL through", async () => {
    const getAuth = await freshGetAuth();
    getAuth();

    expect(createNeonAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.neonauth.test",
        cookies: expect.objectContaining({ secret: "x".repeat(32) }),
      }),
    );
  });

  it("builds the instance once and reuses it", async () => {
    const getAuth = await freshGetAuth();
    expect(getAuth()).toBe(getAuth());
    expect(createNeonAuth).toHaveBeenCalledTimes(1);
  });

  it("is lazy — importing the module builds nothing", async () => {
    await freshGetAuth();
    expect(createNeonAuth).not.toHaveBeenCalled();
  });

  it("refuses to run without its config rather than half-working", async () => {
    delete process.env.NEON_AUTH_BASE_URL;
    const getAuth = await freshGetAuth();
    expect(() => getAuth()).toThrow(/NEON_AUTH_BASE_URL/);
    expect(createNeonAuth).not.toHaveBeenCalled();
  });
});
