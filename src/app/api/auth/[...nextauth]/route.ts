/**
 * Auth.js request handlers (sign-in, magic-link callback, sign-out, session).
 *
 * Guarded by the workspace flag so a default instant-only deployment exposes no
 * auth surface at all — /api/auth/* returns 404 rather than erroring on the
 * absent database.
 */
import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { isWorkspaceEnabled } from "@/lib/workspace";

const notFound = () => new Response("Not found", { status: 404 });

export const GET = (req: NextRequest) =>
  isWorkspaceEnabled() ? handlers.GET(req) : notFound();

export const POST = (req: NextRequest) =>
  isWorkspaceEnabled() ? handlers.POST(req) : notFound();
