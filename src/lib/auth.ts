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
      // `lax`, not the SDK's `strict` default — and not a downgrade to make a
      // bug go away. This value is what makes magic-link sign-in work at all.
      //
      // Requesting a link sets a challenge cookie (`…session_challange`) on this
      // origin, via our /api/auth proxy, with this `sameSite`. The emailed link
      // points at Neon, which verifies the token and redirects back to /app with
      // a `neon_auth_session_verifier` query param. The proxy exchanges verifier
      // + challenge cookie for the session — and needs *both*.
      //
      // That return trip is a top-level navigation initiated from the mail
      // client, i.e. off-site. Under `strict` the challenge cookie is withheld,
      // the exchange never runs, and no session is ever minted — so the proxy
      // bounces you to sign-in. The email arrives and the token is valid; you
      // still land logged-out, with nothing failing loudly.
      //
      // `lax` sends it on top-level GET navigations, which is the case it exists
      // for, and still withholds it on cross-site POSTs, so the CSRF protection
      // that matters is intact. `docs/workspace-mode-design.md` specified
      // `SameSite=Lax` from the start — the code just never passed it.
      sameSite: "lax",
    },
  });
  return cached;
}

/** Where the proxy sends unauthenticated visitors. */
export const SIGN_IN_PATH = "/auth/sign-in";
