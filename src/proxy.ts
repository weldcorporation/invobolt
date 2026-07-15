/**
 * Proxy (formerly "middleware"): gate /app behind a session. Runs only on
 * /app/** (see matcher) — instant mode (`/`) never reaches this file, so it
 * stays cookie-free and local.
 *
 * Uses the edge-safe auth config (JWT, no DB). When workspace mode is off the
 * proxy steps aside and the /app route itself returns 404.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isWorkspaceEnabled } from "@/lib/workspace";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!isWorkspaceEnabled()) return; // let the page render its own 404
  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/app/:path*"],
};
