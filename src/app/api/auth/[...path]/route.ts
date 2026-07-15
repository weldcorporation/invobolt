/**
 * Neon Auth request handlers — proxies sign-in / callback / session / sign-out
 * to the Neon Auth server. Flag-guarded so a default instant-only deployment
 * exposes no auth surface (404 instead of erroring on the absent config).
 */
import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isWorkspaceEnabled } from "@/lib/workspace";

type Ctx = { params: Promise<{ path: string[] }> };

const notFound = () => new Response("Not found", { status: 404 });

export function GET(req: NextRequest, ctx: Ctx) {
  return isWorkspaceEnabled() ? getAuth().handler().GET(req, ctx) : notFound();
}

export function POST(req: NextRequest, ctx: Ctx) {
  return isWorkspaceEnabled() ? getAuth().handler().POST(req, ctx) : notFound();
}
