/**
 * Reading Postgres errors through Drizzle.
 *
 * Not tied to any one table: both repositories lean on a unique index to
 * arbitrate a race (invoice numbers, client names) and need to tell that
 * rejection apart from a real failure.
 */

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/**
 * Whether an error is a duplicate-key rejection.
 *
 * Walks the `cause` chain: Drizzle wraps driver failures in a `DrizzleQueryError`
 * whose own `code` is undefined, so checking only the thrown object silently
 * misses every violation and turns a fixable "that name is taken" into a 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== "object") break;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
