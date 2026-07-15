import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "@/lib/pg-errors";

describe("isUniqueViolation", () => {
  it("recognises Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("finds the code through Drizzle's wrapper, which puts it on `cause`", () => {
    // The shape Drizzle + the Neon driver actually throw: a bare Error whose
    // own `code` is undefined, wrapping the NeonDbError that carries it. Only
    // checking the outer object silently misses every duplicate.
    const wrapped = Object.assign(new Error("Failed query: update ..."), {
      cause: Object.assign(new Error("duplicate key value"), {
        code: "23505",
        constraint: "invoices_user_number_idx",
      }),
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("ignores a wrapped error that is not a unique violation", () => {
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("undefined table"), { code: "42P01" }),
    });
    expect(isUniqueViolation(wrapped)).toBe(false);
  });

  it("terminates on a self-referencing cause chain", () => {
    const loop = new Error("loop") as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isUniqueViolation(loop)).toBe(false);
  });
});
