/**
 * Email delivery for workspace mode (v0.3), via Resend's REST API.
 *
 * A `fetch` to one endpoint rather than the SDK: the surface we use is a
 * single POST, and a dependency would be more code to audit than this file.
 * Everything here is server-only — the API key must never reach a client
 * bundle.
 */

import "server-only";

/**
 * Email delivery is a feature of its own on top of workspace mode: it exists
 * only when both variables are set, and the Send UI simply doesn't render
 * otherwise. Same pattern as `isWorkspaceEnabled` — unconfigured means
 * invisible, not broken.
 */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** The default per-user sends-per-24h cap. See `dailyEmailCap`. */
const DEFAULT_DAILY_CAP = 20;

/**
 * How many invoice emails one user may send per rolling 24 hours.
 *
 * The cap is anti-abuse, not billing: sending mail is the first workspace
 * action that costs more than an indexed lookup and could hurt someone other
 * than the sender (the recipient, and our sending domain's reputation).
 * Tunable via `EMAIL_DAILY_CAP`; nonsense values fall back to the default.
 */
export function dailyEmailCap(): number {
  const raw = Number(process.env.EMAIL_DAILY_CAP);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP;
}

export interface EmailDelivery {
  /** Resend's message id, for tracing a delivery complaint. */
  providerId: string | null;
}

/**
 * Send one plain-text email. Throws on any provider rejection — callers turn
 * that into a user-facing message; the provider's own response body stays in
 * the server log, where details about our sending setup belong.
 */
export async function deliverEmail(
  to: string,
  subject: string,
  text: string,
): Promise<EmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });

  if (!response.ok) {
    console.error(
      `Resend rejected a send (${response.status}): ${await response.text()}`,
    );
    throw new Error(`Email provider rejected the send (${response.status}).`);
  }

  const body = (await response.json()) as { id?: unknown };
  return { providerId: typeof body.id === "string" ? body.id : null };
}
