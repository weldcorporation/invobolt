/**
 * Proxy (Next 16's renamed middleware): gate /app behind a Neon Auth session.
 * Runs only on /app/** (see matcher) — instant mode (`/`) never reaches this
 * file, so it stays cookie-free and local.
 *
 * When workspace mode is off the proxy steps aside and the /app route renders
 * its own 404. The Neon Auth middleware is built lazily (per the getAuth()
 * contract) so no config is required for a default build.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAuth, SIGN_IN_PATH } from "@/lib/auth";
import { isWorkspaceEnabled } from "@/lib/workspace";

export default function proxy(req: NextRequest) {
  if (!isWorkspaceEnabled()) return NextResponse.next();

  // Gate navigations only. Every Server Action already calls `requireUserId()`
  // (see src/lib/session.ts), which is the actual boundary — the proxy is the
  // redirect-to-sign-in courtesy on top of it, and courtesies don't get to
  // break writes.
  //
  // They would, though. The SDK's middleware checks the session by forwarding
  // *the incoming request* upstream — `method: request.method` — to Neon's
  // `get-session`, which only answers GET. So a Server Action's POST /app is
  // forwarded as a POST, rejected, read as "no session", and answered with a
  // 307 to sign-in. 307 preserves the method, so the action POSTs itself into
  // the sign-in page, gets HTML where it wanted a result, and throws — surfacing
  // as "Couldn't reach the server" while the server was never even asked. Every
  // write under /app fails this way, not just the one you happen to try first.
  //
  // The SDK knows the shape of this: its OAuth exchange builds an explicit
  // `new Request(url, { method: "GET" })` for the same call. The middleware path
  // just doesn't. Skipping non-GET here costs nothing and gives up nothing.
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  return getAuth().middleware({ loginUrl: SIGN_IN_PATH })(req);
}

export const config = {
  matcher: ["/app/:path*"],
};
