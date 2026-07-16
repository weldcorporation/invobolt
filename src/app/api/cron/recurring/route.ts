import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { originFromHeaders } from "@/lib/origin";
import { generateDueInvoices } from "@/lib/recurring";
import { todayIso } from "@/lib/status";
import { isWorkspaceEnabled } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The recurring-invoice tick, hit daily by Vercel Cron (see `crons` in
 * vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET` on its own
 * once that env var exists; self-hosters point any scheduler at this route
 * with the same header.
 *
 * Constant-time comparison because this is a bare secret check on a public
 * route — the one place in the app where a timing oracle would actually
 * leak key material.
 */
function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  // Unconfigured means the route doesn't exist — the same 404 story as
  // /app/** with the flag off. No secret, no endpoint.
  if (!isWorkspaceEnabled()) return new NextResponse(null, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });

  if (!authorized(request.headers.get("authorization"), secret)) {
    return new NextResponse(null, { status: 401 });
  }

  const summary = await generateDueInvoices(
    todayIso(),
    originFromHeaders(request.headers),
  );
  return NextResponse.json(summary);
}
