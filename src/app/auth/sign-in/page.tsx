"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Passwordless sign-in: requests a Neon Auth magic link for the given email.
 * The exact methods a project offers (magic link, email OTP, social) are
 * configured in the Neon Auth dashboard; this page uses the magic link.
 */
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      // /auth/callback, not /app: the emailed link comes back with a verifier
      // that only a *client* can exchange for a session, and /app is a Server
      // Component behind the proxy — it would bounce to sign-in before any
      // client code ran. See src/app/auth/callback/page.tsx.
      callbackURL: "/auth/callback",
    });
    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
      <div className="mb-5 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="Invobolt" width={28} height={28} />
        <div className="text-base font-bold tracking-tight">
          Invobolt <span className="text-neutral-400">Workspace</span>
        </div>
      </div>

      {status === "sent" ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Check your inbox — we sent a magic link to <strong>{email}</strong>.
          Open it on this device to finish signing in.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {error && <p className="text-sm text-overdue">{error}</p>}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Email me a magic link"}
          </button>
        </form>
      )}
    </div>
  );
}
