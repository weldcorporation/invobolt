import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The proxy must gate navigations without touching Server Actions.
 *
 * This looks like an over-cautious `if`, which is exactly why it needs a test:
 * deleting it passes typecheck, passes the build, and leaves /app rendering
 * perfectly — while every write silently fails. The SDK's middleware checks the
 * session by forwarding the incoming request upstream with its original method,
 * and Neon's `get-session` only answers GET, so a Server Action's POST reads as
 * "no session" and gets a 307 into the sign-in page. Nothing errors server-side;
 * the client just sees HTML where a result should be.
 *
 * Skipping non-GET gives up nothing: `requireUserId()` in src/lib/session.ts is
 * the real boundary, and every action calls it (tenant-isolation.test.ts holds
 * that line).
 */
const middleware = vi.fn(() => new Response(null, { status: 307 }));
const getAuth = vi.fn(() => ({ middleware: () => middleware }));

vi.mock("@/lib/auth", () => ({
  getAuth: () => getAuth(),
  SIGN_IN_PATH: "/auth/sign-in",
}));

const isWorkspaceEnabled = vi.fn(() => true);
vi.mock("@/lib/workspace", () => ({
  isWorkspaceEnabled: () => isWorkspaceEnabled(),
}));

async function freshProxy() {
  vi.resetModules();
  return (await import("@/proxy")).default;
}

/** Enough of a NextRequest for a proxy that only reads `.method`. */
const request = (method: string) =>
  ({ method, url: "https://example.test/app" }) as never;

describe("proxy", () => {
  beforeEach(() => {
    middleware.mockClear();
    getAuth.mockClear();
    isWorkspaceEnabled.mockReturnValue(true);
  });

  it.each(["GET", "HEAD"])("gates %s navigations on the session", async (m) => {
    const proxy = await freshProxy();
    proxy(request(m));

    expect(middleware).toHaveBeenCalledOnce();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "lets a %s through — Server Actions authenticate themselves",
    async (m) => {
      const proxy = await freshProxy();
      const res = proxy(request(m));

      // Not merely "didn't redirect": the SDK middleware must not run at all,
      // because running it is what produces the 307 that eats the action.
      expect(middleware).not.toHaveBeenCalled();
      expect((res as Response).status).not.toBe(307);
    },
  );

  it("stays out of the way entirely when workspace mode is off", async () => {
    isWorkspaceEnabled.mockReturnValue(false);
    const proxy = await freshProxy();
    proxy(request("GET"));

    expect(getAuth).not.toHaveBeenCalled();
  });
});
