/**
 * Edge-safe Auth.js configuration.
 *
 * This half carries no database adapter and no Node-only imports, so it can be
 * evaluated in middleware (Edge runtime). `src/lib/auth.ts` layers the Drizzle
 * adapter on top for the Node route handler and server components. Sessions are
 * JWT so the middleware can authorise a request from the cookie without a DB
 * round-trip. See docs/workspace-mode-design.md.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Trust the deployment host (Vercel sets this automatically; self-hosters
  // behind a reverse proxy need it so Auth.js accepts the forwarded host).
  trustHost: true,
  // JWT sessions keep middleware DB-free; the adapter (in auth.ts) still backs
  // user records and single-use magic-link tokens.
  session: { strategy: "jwt" },
  // No providers here on purpose: the email (magic-link) provider requires an
  // adapter, so it lives only in the Node config (auth.ts). The proxy just
  // reads the JWT to authorise a request, which needs no providers.
  providers: [],
  callbacks: {
    /** Used by the proxy wrapper to gate /app. */
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
