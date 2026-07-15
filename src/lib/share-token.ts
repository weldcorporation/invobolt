/**
 * Share tokens: the capability that makes `/i/[token]` viewable.
 *
 * There is no account check on that route — holding the token *is* the
 * authorization — so the token has to be unguessable rather than merely
 * unique. That rules out anything derived from the row (an id, a hash of the
 * number, a counter): those are predictable from public information. This is
 * random, and nothing else.
 */

/**
 * 24 bytes = 192 bits, comfortably past the design's ≥128-bit floor and past
 * `randomUUID`'s 122. Encodes to exactly 32 unpadded base64url characters.
 */
const TOKEN_BYTES = 24;

/** What a minted token looks like: base64url, no padding. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A fresh, unguessable token.
 *
 * `crypto.getRandomValues` (Web Crypto) rather than `Math.random`, which is not
 * a CSPRNG and would make links predictable from one another. Reached through
 * the global so this works unchanged in the Node and Edge runtimes.
 */
export function mintShareToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * Whether a string could be one of our tokens.
 *
 * A cheap shape check before touching the database, so a URL full of junk costs
 * a regex instead of a query. Not a security boundary — the lookup is — but it
 * keeps the obvious noise off the connection.
 */
export function isShareToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}
