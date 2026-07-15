/**
 * Row ids reach the server from URLs and form posts, i.e. from anywhere.
 * Handing Postgres a non-uuid for a `uuid` column raises `invalid input syntax`
 * rather than returning no rows, so every repository checks the shape first and
 * treats a malformed id as simply "not found".
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
