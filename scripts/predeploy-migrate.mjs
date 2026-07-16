/**
 * Applies Drizzle migrations ahead of the production build, but only when
 * workspace mode is actually configured.
 *
 * Runs from the `vercel-build` script, so the schema a deployment needs exists
 * before that deployment ever serves a request. Vercel finishes the build
 * before routing traffic to it, so code can't go live ahead of its own tables.
 *
 * The flag check must stay identical to `isWorkspaceEnabled()` in
 * src/lib/workspace.ts (`=== "true"`, not truthiness). If the two ever disagree,
 * the build and the app disagree about whether workspace mode is on — which
 * shows up as /app querying tables that were never migrated.
 *
 * Three outcomes, deliberately:
 *
 * - flag off → skip and exit 0. Instant mode is the default and must build with
 *   zero environment variables (README, docs/workspace-mode-design.md). An
 *   unconditional `drizzle-kit migrate` would break exactly the build this repo
 *   promises self-hosters, because drizzle.config.ts falls back to an empty URL.
 * - flag on, no DATABASE_URL → fail loudly. That pairing is a misconfiguration,
 *   and failing the build is far cheaper than shipping an /app that throws on
 *   its first query.
 * - flag on, URL present → migrate, and let a failure fail the build.
 */
import { spawnSync } from "node:child_process";

// `next build` and `drizzle-kit` both read .env on their own. Read it here too,
// or a local run could skip migrations and then build workspace mode anyway —
// the guard would be answering a different question than the app. Real
// environment variables still win (loadEnvFile does not override), so Vercel's
// dashboard config is unaffected; on Vercel there is no .env to find.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env — the normal case on Vercel and in CI.
  }
}

const enabled = process.env.WORKSPACE_ENABLED === "true";
const url = process.env.DATABASE_URL;

if (!enabled) {
  console.log(
    "[predeploy] WORKSPACE_ENABLED is not \"true\" — instant-mode build, skipping migrations.",
  );
  process.exit(0);
}

if (!url) {
  console.error(
    "[predeploy] WORKSPACE_ENABLED=true but DATABASE_URL is unset. Workspace mode\n" +
      "            cannot serve /app without a database. Set DATABASE_URL, or unset\n" +
      "            WORKSPACE_ENABLED to build instant mode only.",
  );
  process.exit(1);
}

// Log the target host so a deploy log shows which database was migrated —
// without ever printing the credential in it.
try {
  const { hostname, pathname } = new URL(url);
  console.log(`[predeploy] migrating ${hostname}${pathname}`);
} catch {
  console.error("[predeploy] DATABASE_URL is not a valid URL.");
  process.exit(1);
}

// Shell out to the same `db:migrate` script humans run, so there is one
// definition of "apply the migrations" rather than a second one that drifts.
const result = spawnSync("pnpm", ["run", "db:migrate"], {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error("[predeploy] migrations failed — failing the build.");
  process.exit(result.status ?? 1);
}
