import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest runs the library code under `src/lib` in a Node environment — no
 * browser, no Next.js. The `@/*` alias mirrors tsconfig so tests can import
 * modules the same way the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Workspace-mode modules are marked `server-only`, whose real entry point
      // throws outside a React Server Component. See the stub for why aliasing
      // it is safe.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
