/**
 * Full Auth.js setup for workspace mode (Node runtime): the edge-safe config
 * plus the Drizzle/Neon adapter that stores users and single-use magic-link
 * tokens.
 *
 * The config is passed as a lazy function so `getDb()` — which needs
 * `DATABASE_URL` — runs only when an auth request is actually handled, never at
 * import or during `next build`. With workspace mode off, nothing calls these.
 */

import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { authConfig } from "./auth.config";
import { getDb, schema } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // The magic-link provider lives here (Node only) because it needs the adapter.
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    }),
  ],
}));
