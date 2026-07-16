/**
 * Neon Auth (Managed Better Auth) server instance for workspace mode.
 *
 * Built lazily: `createNeonAuth` validates `NEON_AUTH_COOKIE_SECRET` (and throws
 * if it is missing or shorter than 32 chars), so we only construct it on the
 * first real auth request — never at import or during `next build`. With
 * workspace mode off, nothing calls `getAuth()`.
 *
 * Runs in both the Node runtime (route handler, server components) and the Edge
 * runtime (the proxy) — the Neon Auth SDK supports both.
 */

import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

let cached: NeonAuth | null = null;

export function getAuth(): NeonAuth {
  if (cached) return cached;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) {
    throw new Error(
      "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set — workspace mode requires Neon Auth.",
    );
  }
  cached = createNeonAuth({
    baseUrl,
    cookies: {
      secret,
      // `lax`, not the SDK's `strict` default.
      //
      // This governs the session cookie our /api/auth proxy mints. `strict`
      // withholds a cookie on *any* top-level navigation that began off-site, so
      // following a link into /app from an email, a chat message, or another app
      // would render logged-out despite a perfectly good session, and the proxy
      // would bounce you to sign-in. `lax` sends it on top-level GET navigations
      // — the case it exists for — and still withholds it on cross-site POSTs,
      // so the CSRF protection that matters is intact. `SameSite=Lax` is what
      // `docs/workspace-mode-design.md` specified from the start.
      //
      // What this does NOT do is make magic-link sign-in work; sign-in works
      // under `strict` too. Two earlier attempts in this file claimed otherwise,
      // in opposite directions, and both were wrong — so, measured against a
      // live Neon instance: the sign-in request sets no cookie at all, and the
      // emailed link is verified on Neon's origin, which redirects to our
      // `callbackURL` with a `neon_auth_session_verifier` param and no cookie of
      // any kind. The session is minted by the *client* exchanging that verifier
      // (see src/app/auth/callback/page.tsx), over a same-origin fetch that no
      // SameSite value affects. The SDK middleware does have a verifier exchange,
      // but it also requires a `session_challange` cookie that only OAuth sets,
      // so it never fires for magic link.
      sameSite: "lax",
    },
  });
  return cached;
}

/** Where the proxy sends unauthenticated visitors. */
export const SIGN_IN_PATH = "/auth/sign-in";
