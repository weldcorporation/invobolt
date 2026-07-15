/**
 * Neon Auth browser client for workspace mode.
 *
 * The Next.js client is same-origin: it talks to this app's own `/api/auth`
 * proxy (which forwards to Neon Auth), so it needs no base URL or secret. Import
 * it only from client components under `/app` and `/auth` — never from instant
 * mode.
 */

"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();
