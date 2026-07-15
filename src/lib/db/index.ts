/**
 * Neon Postgres connection for workspace mode (v0.2).
 *
 * Lazy by design: importing this module does nothing until `getDb()` is called,
 * so build/typecheck never require a live database and instant mode — which
 * never calls it — stays a zero-dependency, zero-env-var client app.
 */

import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export { schema };

/** True when workspace mode is switched on. Off (the default) = instant only. */
export function isWorkspaceEnabled(): boolean {
  return process.env.WORKSPACE_ENABLED === "true";
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

/**
 * Get the Drizzle client, creating it on first use. Throws if called without a
 * `DATABASE_URL` — a programming error, since only workspace-mode server code
 * (gated behind `isWorkspaceEnabled()`) should ever reach this.
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — workspace mode requires a Postgres connection.",
    );
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}
