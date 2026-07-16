/**
 * Pure helpers for the "Pay now" link (v0.3).
 *
 * The link is sender-provided and provider-agnostic — a Stripe Payment Link,
 * PayPal.me, a Tikkie — and it is rendered as a clickable button for the
 * recipient on `/i/[token]` and in the invoice email. That render target is
 * why the validation exists: whatever passes here becomes an `href` on a page
 * we serve to someone who trusts the sender.
 */

/** Payment links are pasted URLs; anything longer is not one. */
export const MAX_PAYMENT_LINK_CHARS = 2048;

/** Trim, and treat empty as "no link" — clearing the field clears the column. */
export function normalizePaymentLink(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Problems that make a URL unsafe to store as a payment link. Empty means ok.
 *
 * `https:` only — not `http:` (a payment page without TLS is a phishing
 * pattern) and, more importantly, not `javascript:` or anything else an
 * attacker-shaped value could smuggle into an `href`. Embedded credentials
 * (`user:pass@host`) are rejected because they are a classic look-alike trick:
 * `https://yourbank.com@evil.example` reads as the bank and goes to evil.
 */
export function validatePaymentLink(url: string): string[] {
  if (url.length > MAX_PAYMENT_LINK_CHARS) {
    return ["That link is too long to be a payment URL."];
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return ["That doesn't look like a full URL — include https://."];
  }

  if (parsed.protocol !== "https:") {
    return ["Payment links must start with https://."];
  }
  if (parsed.username || parsed.password) {
    return ["Payment links must not contain credentials."];
  }

  return [];
}
