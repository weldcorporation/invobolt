/**
 * The single place workspace-mode server code learns *who* is asking.
 *
 * The proxy already gates `/app/**` on a session, but Server Actions are
 * publicly-reachable endpoints in their own right, so every one of them
 * re-derives the user id here rather than trusting a client-supplied id. This
 * is defence in depth: the proxy can be misconfigured, this cannot be bypassed.
 */

import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuth, SIGN_IN_PATH } from "./auth";
import { isWorkspaceEnabled } from "./workspace";

/**
 * The Neon Auth user id for the current request. Redirects to sign-in when
 * there is no session, and 404s when workspace mode is off — matching what
 * `/app` itself does, so a disabled deployment exposes no live endpoints.
 */
export async function requireUserId(): Promise<string> {
  if (!isWorkspaceEnabled()) notFound();

  const { data: session } = await getAuth().getSession();
  const userId = session?.user?.id;
  if (!userId) redirect(SIGN_IN_PATH);

  return userId;
}
