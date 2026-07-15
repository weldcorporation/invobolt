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
  return getAuth().middleware({ loginUrl: SIGN_IN_PATH })(req);
}

export const config = {
  matcher: ["/app/:path*"],
};
