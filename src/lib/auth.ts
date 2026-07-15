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
      // bug go away.
      //
      // Clicking a magic link is a top-level navigation *initiated from your
      // mail client*, i.e. cross-site. A `strict` cookie is withheld for the
      // whole of that navigation chain, including the redirect to /app after
      // the token is verified — so the session gets set and then not sent, and
      // the proxy bounces you back to sign-in. Landing logged-out is exactly
      // the symptom `strict` produces here.
      //
      // `lax` sends the cookie on top-level GET navigations only, which is the
      // case it was designed for; it still withholds it on cross-site POSTs, so
      // the CSRF protection that matters is intact. This is what
      // `docs/workspace-mode-design.md` specified all along.
      sameSite: "lax",
    },
  });
  return cached;
}

/** Where the proxy sends unauthenticated visitors. */
export const SIGN_IN_PATH = "/auth/sign-in";
