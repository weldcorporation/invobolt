"use server";

/**
 * Server Actions for workspace invoices.
 *
 * Each one is a public endpoint, so each one independently re-derives the user
 * from the session (`requireUserId`) and passes it to a repository function that
 * cannot query without it. No action trusts a caller-supplied user id.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/session";
import { validateInvoice } from "@/lib/invoice-row";
import {
  createInvoice,
  deleteInvoice,
  saveInvoice,
  setInvoiceStatus,
  shareInvoice,
  unshareInvoice,
} from "@/lib/invoices";
import {
  deleteClient,
  updateClient,
  upsertClient,
  type SavedClient,
} from "@/lib/clients";
import { isParty, validateClientParty } from "@/lib/party";
import { isUniqueViolation } from "@/lib/pg-errors";
import { upsertProfile } from "@/lib/profiles";
import {
  isBusinessProfile,
  profileFromInvoice,
  validateBusinessProfile,
} from "@/lib/profile";
import { isInvoiceStatus } from "@/lib/status";
import type { Invoice } from "@/lib/types";

/** Create a draft and open it. */
export async function createInvoiceAction(): Promise<never> {
  const userId = await requireUserId();
  const id = await createInvoice(userId);

  revalidatePath("/app");
  redirect(`/app/invoices/${id}`);
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the editor's current document. Returns a result rather than throwing
 * so autosave can surface the problem inline and let the user keep typing —
 * a thrown error would blank the editor on a fixable mistake like a duplicate
 * invoice number.
 */
export async function saveInvoiceAction(
  id: string,
  document: Invoice,
): Promise<SaveResult> {
  const userId = await requireUserId();

  const problems = validateInvoice(document);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  try {
    const saved = await saveInvoice(userId, id, document);
    if (!saved) return { ok: false, error: "This invoice no longer exists." };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `You already have an invoice numbered ${document.number.trim()}.`,
      };
    }
    throw error;
  }

  revalidatePath("/app");
  return { ok: true };
}

/**
 * Move an invoice to another status.
 *
 * `next` is narrowed at runtime rather than trusted: this is a public endpoint
 * and the `InvoiceStatus` annotation is erased in the compiled output, so
 * without the check any string a caller sent would land in the column.
 */
export async function setInvoiceStatusAction(
  id: string,
  next: unknown,
): Promise<SaveResult> {
  const userId = await requireUserId();

  if (!isInvoiceStatus(next)) return { ok: false, error: "Unknown status." };

  const result = await setInvoiceStatus(userId, id, next);
  if (result === "not-found") {
    return { ok: false, error: "This invoice no longer exists." };
  }
  if (result === "illegal") {
    return { ok: false, error: `This invoice can't be moved to ${next}.` };
  }

  revalidatePath("/app");
  revalidatePath(`/app/invoices/${id}`);
  return { ok: true };
}

/** Delete an invoice and return to the list. */
export async function deleteInvoiceAction(id: string): Promise<never> {
  const userId = await requireUserId();
  await deleteInvoice(userId, id);

  revalidatePath("/app");
  redirect("/app");
}

/**
 * Store a `BusinessProfile` the browser sent us as the account's defaults.
 *
 * This is the one action that carries data the user never typed into this
 * surface — it comes off localStorage — so it only ever runs from an explicit
 * click, and the payload is narrowed (`isBusinessProfile`) and rebuilt
 * (`normalizeBusinessProfile`, inside `upsertProfile`) rather than trusted.
 * Anything on the origin can write localStorage; none of it gets to widen a
 * jsonb column.
 */
export async function importProfileAction(profile: unknown): Promise<SaveResult> {
  const userId = await requireUserId();

  if (!isBusinessProfile(profile)) {
    return { ok: false, error: "That doesn't look like a saved profile." };
  }

  const problems = validateBusinessProfile(profile);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  await upsertProfile(userId, profile);

  revalidatePath("/app");
  return { ok: true };
}

/**
 * Save the invoice you're editing as your defaults, so the next one starts
 * there. The workspace counterpart of instant mode's "Save profile", and the
 * only way an imported profile can ever be corrected.
 */
export async function saveProfileFromInvoiceAction(
  document: unknown,
): Promise<SaveResult> {
  const userId = await requireUserId();

  // The invoice is already this account's data, but it arrives over the wire
  // like anything else — derive the profile, then hold it to the same bar.
  const profile = isInvoiceLike(document)
    ? profileFromInvoice(document)
    : null;
  if (!profile || !isBusinessProfile(profile)) {
    return { ok: false, error: "Couldn't read this invoice's details." };
  }

  const problems = validateBusinessProfile(profile);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  await upsertProfile(userId, profile);
  return { ok: true };
}

/** Enough of an `Invoice` for `profileFromInvoice` to read; the result is then narrowed properly. */
function isInvoiceLike(value: unknown): value is Invoice {
  return typeof value === "object" && value !== null && "seller" in value;
}

export type ShareResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

/**
 * Mint (or re-return) this invoice's share link. Idempotent — see
 * `shareInvoice`; pressing Share twice must not break a link already sent.
 */
export async function shareInvoiceAction(id: string): Promise<ShareResult> {
  const userId = await requireUserId();

  const token = await shareInvoice(userId, id);
  if (!token) return { ok: false, error: "This invoice no longer exists." };

  revalidatePath(`/app/invoices/${id}`);
  return { ok: true, token };
}

/** Revoke the share link. The URL stops resolving for everyone holding it. */
export async function unshareInvoiceAction(id: string): Promise<SaveResult> {
  const userId = await requireUserId();

  const revoked = await unshareInvoice(userId, id);
  if (!revoked) return { ok: false, error: "This invoice no longer exists." };

  revalidatePath(`/app/invoices/${id}`);
  return { ok: true };
}

export type SaveClientResult =
  | { ok: true; client: SavedClient }
  | { ok: false; error: string };

/**
 * Save a bill-to party as a reusable client, replacing any of the user's
 * clients with that name.
 *
 * `party` is narrowed and re-built at runtime rather than trusted: the `Party`
 * annotation is erased in the compiled output, and `normalizeParty` (inside
 * `upsertClient`) drops any key that isn't a Party's, so a caller can't post a
 * fatter object and have it land in the jsonb column.
 */
export async function saveClientAction(
  party: unknown,
): Promise<SaveClientResult> {
  const userId = await requireUserId();

  if (!isParty(party)) return { ok: false, error: "That isn't a client." };

  const problems = validateClientParty(party);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  const client = await upsertClient(userId, party);

  revalidatePath("/app/clients");
  return { ok: true, client };
}

/**
 * Edit a specific saved client. Unlike `saveClientAction` this addresses the
 * row by id, so renaming a client edits it rather than creating a second one.
 */
export async function updateClientAction(
  id: string,
  party: unknown,
): Promise<SaveResult> {
  const userId = await requireUserId();

  if (!isParty(party)) return { ok: false, error: "That isn't a client." };

  const problems = validateClientParty(party);
  if (problems.length > 0) return { ok: false, error: problems[0] };

  try {
    const updated = await updateClient(userId, id, party);
    if (!updated) return { ok: false, error: "That client no longer exists." };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `You already have a client named ${party.name.trim()}.`,
      };
    }
    throw error;
  }

  revalidatePath("/app/clients");
  return { ok: true };
}

/** Delete a saved client. Invoices already written keep their own copy. */
export async function deleteClientAction(id: string): Promise<SaveResult> {
  const userId = await requireUserId();

  const deleted = await deleteClient(userId, id);
  if (!deleted) return { ok: false, error: "That client no longer exists." };

  revalidatePath("/app/clients");
  return { ok: true };
}
