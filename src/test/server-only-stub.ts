/**
 * Test stub for the `server-only` package.
 *
 * `server-only` exists to make a build fail when a server module is pulled into
 * a client bundle: outside the `react-server` condition its real entry point
 * throws on import. Vitest runs plain Node, so importing a server module under
 * test would trip that guard. Aliasing it here (see `vitest.config.mts`) lets
 * tests import server modules while leaving the real guard intact for `next
 * build` — which is the place it actually protects us.
 */
export {};
