import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for workspace mode (v0.2). `db:generate` reads the schema
 * and writes SQL migrations to ./drizzle without touching a database;
 * `db:migrate` applies them and needs DATABASE_URL.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
