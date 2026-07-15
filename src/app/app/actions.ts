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
  isUniqueViolation,
  saveInvoice,
} from "@/lib/invoices";
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

/** Delete an invoice and return to the list. */
export async function deleteInvoiceAction(id: string): Promise<never> {
  const userId = await requireUserId();
  await deleteInvoice(userId, id);

  revalidatePath("/app");
  redirect("/app");
}
