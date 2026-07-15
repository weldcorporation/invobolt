/**
 * The single switch that mounts workspace mode (v0.2).
 *
 * Deliberately dependency-free (no `server-only`, no db driver) so it can be
 * read from anywhere — edge middleware, server components, route handlers —
 * without pulling Postgres into that bundle. Off by default: with
 * `WORKSPACE_ENABLED` unset the app is exactly the instant-mode-only build.
 */
export function isWorkspaceEnabled(): boolean {
  return process.env.WORKSPACE_ENABLED === "true";
}
