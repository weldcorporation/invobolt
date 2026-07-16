"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Where a magic link lands, and the only place the session can be created.
 *
 * Neon verifies the emailed token on its own origin and redirects here with a
 * `neon_auth_session_verifier` param. Nothing is signed in yet at that point:
 * the verifier is a one-time claim ticket, not a session. The Neon Auth client
 * has a `getSession` hook that reads that param off `window.location` and
 * attaches it to its `/api/auth/get-session` call; that request goes through our
 * own proxy, which is what mints the session cookie on *this* origin. So the
 * exchange only happens in a browser, on a page that actually loads — hence a
 * client component whose whole job is to call `getSession()` once.
 *
 * This can't live on /app. That's a Server Component: it needs the cookie before
 * it renders, and the proxy would bounce the request to sign-in before any
 * client code ran — killing the exchange that would have let it through. Hence
 * this hop, and hence `/auth/**` staying outside the proxy's matcher.
 *
 * The SDK agrees, for what it's worth: its middleware skips `/auth/callback`,
 * `authViewPaths` defines a `callback` view, and Neon's own example ships this
 * route. Its middleware *does* have a verifier exchange, but that one also
 * demands a `session_challange` cookie that only the OAuth flow sets — magic
 * link sends the verifier with no such cookie, so that path never fires here.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Once only: the verifier is single-use, and StrictMode double-invokes
    // effects in development.
    if (started.current) return;
    started.current = true;

    // A hung fetch resolves neither `then` nor `catch`, which would leave the
    // spinner up forever on the one page every user has to get through. Give up
    // and offer a way out. Deliberately no `clearTimeout` in an effect cleanup:
    // the `started` guard above means a StrictMode remount returns early and
    // would never re-arm the timer, so cleaning it up there would disable this
    // in development — the one place we'd notice it.
    let settled = false;
    const giveUp = setTimeout(() => {
      if (!settled) setFailed(true);
    }, 10_000);

    const stop = () => {
      settled = true;
      clearTimeout(giveUp);
    };

    authClient
      .getSession()
      .then(({ data }) => {
        stop();
        if (data) {
          // `replace`, not `push` — the spent verifier must not be reachable
          // with the back button. Still worth doing if we already gave up: a
          // late success beats a stale error.
          router.replace("/app");
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        stop();
        setFailed(true);
      });
  }, [router]);

  if (failed) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 p-6 text-center shadow-sm dark:border-neutral-800">
        {/* Covers both ways we get here: a link that was rejected, and one we
            gave up waiting on. Naming only the first would be a guess, and the
            remedy is the same either way. */}
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          We couldn&apos;t finish signing you in. The link may have expired or
          already been used — or the connection stalled.
        </p>
        <a
          href="/auth/sign-in"
          className="mt-4 inline-block rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
        >
          Get a new link
        </a>
      </div>
    );
  }

  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-300">
      Signing you in…
    </p>
  );
}
