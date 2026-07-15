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
  cached = createNeonAuth({ baseUrl, cookies: { secret } });
  return cached;
}

/** Where the proxy sends unauthenticated visitors. */
export const SIGN_IN_PATH = "/auth/sign-in";
