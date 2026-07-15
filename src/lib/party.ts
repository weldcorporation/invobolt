/**
 * Pure helpers for the `Party` document, shared by invoices and saved clients.
 *
 * No server deps, so this is unit tested and reused on both sides: the client
 * validates before asking, the Server Action validates because it must.
 */

import type { Party } from "./types";

/** The keys a Party has. Anything else is not ours and does not get stored. */
const PARTY_KEYS = ["name", "address", "vatNumber", "email", "country"] as const;

/** Generous, but bounded — these land in a jsonb column. */
export const MAX_PARTY_FIELD_CHARS = 2000;

/**
 * Narrow untrusted input. A Server Action's `Party` annotation is erased in the
 * compiled output, so a party arriving from a caller is an unknown value until
 * this says otherwise.
 */
export function isParty(value: unknown): value is Party {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return PARTY_KEYS.every((key) => typeof candidate[key] === "string");
}

/**
 * Trim every field and drop anything that isn't a Party key.
 *
 * The rebuild is deliberate: it doubles as the sanitiser for untrusted input,
 * so a caller can't smuggle extra keys into the stored document by posting a
 * fatter object. Trimming the name also makes " Acme " and "Acme" the same
 * client under the unique index.
 */
export function normalizeParty(party: Party): Party {
  return {
    name: party.name.trim(),
    address: party.address.trim(),
    vatNumber: party.vatNumber.trim(),
    email: party.email.trim(),
    country: party.country.trim(),
  };
}

/**
 * The key a saved client dedupes on: the name, case-folded.
 *
 * Plain `toLowerCase` rather than `toLocaleLowerCase`, which is locale-
 * dependent (in Turkish, "I" folds to a dotless ı) and would make the key
 * depend on where the server happens to be running.
 */
export function clientNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Problems that would make a party unsafe to save as a client, in plain English. */
export function validateClientParty(party: Party): string[] {
  const problems: string[] = [];
  const normalized = normalizeParty(party);

  if (!normalized.name) {
    // The name is the client's identity here: it's the NOT NULL column and the
    // unique index target, so a nameless client can't be stored or found again.
    problems.push("Give this client a name before saving it.");
  }

  for (const key of PARTY_KEYS) {
    if (normalized[key].length > MAX_PARTY_FIELD_CHARS) {
      problems.push(`That ${key === "vatNumber" ? "VAT number" : key} is too long.`);
    }
  }

  return problems;
}
