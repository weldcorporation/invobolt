import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The session cookie policy.
 *
 * `sameSite: "lax"` looks like a weaker choice than the SDK's `strict` default,
 * so it is the kind of line a security pass "hardens" — and what it breaks is
 * quiet: a valid session simply renders logged-out when the user arrives from an
 * off-site link. Nothing in the type system or the build catches it. This test
 * does, and says why.
 *
 * It does not guard magic-link sign-in — that works under `strict` too. See the
 * comment in auth.ts for what actually establishes the session.
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

  it("sets SameSite=Lax, so an off-site link into /app keeps the session", async () => {
    const getAuth = await freshGetAuth();
    getAuth();

    // Following a link into /app from an email or a chat message is a top-level
    // navigation that began off-site. `strict` withholds the session cookie for
    // it, so the proxy sees no session and bounces a signed-in user to sign-in.
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
