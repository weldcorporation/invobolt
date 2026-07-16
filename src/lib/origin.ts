/**
 * The public origin of the current deployment, derived from request headers.
 *
 * Needed wherever the server builds an absolute link to itself — the share URL
 * in an invoice email — because there is no configured base-URL env var and
 * `window.location.origin` only exists in the browser. On Vercel the `host`
 * header is set by the platform's routing layer, not the client, so it names
 * this deployment; self-hosters behind a proxy get the standard
 * `x-forwarded-proto` treatment.
 *
 * The shape checks matter: this value is embedded into an email we send, so a
 * header that doesn't look like a host must yield "no origin" (and the caller
 * refuses to send) rather than a poisoned link.
 */

const HOST_SHAPE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** Structural type so this stays testable with a plain Map-backed fake. */
export function originFromHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  const host = headers.get("host");
  if (!host || !HOST_SHAPE.test(host)) return null;

  // Multi-hop proxies join values ("https, http") — the first is the client's.
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded === "http" ? "http" : "https";

  return `${proto}://${host}`;
}
