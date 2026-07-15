"use client";

import { useState } from "react";
import { PartyFields } from "@/components/InvoiceForm";
import { ui } from "@/lib/i18n";
import { emptyParty } from "@/lib/sample";
import { validateClientParty } from "@/lib/party";
import type { SavedClient } from "@/lib/clients";
import type { Party } from "@/lib/types";
import {
  deleteClientAction,
  saveClientAction,
  updateClientAction,
} from "../actions";

/** `id: null` means a new client; otherwise we're editing that row. */
type Draft = { id: string | null; party: Party };

/**
 * Saved clients CRUD.
 *
 * Party editing reuses `PartyFields` from the invoice form verbatim, so a
 * client has exactly the fields a bill-to has — they are the same `Party`.
 * The list comes from the server component and refreshes itself: each action
 * revalidates `/app/clients`, which re-renders this component with new props.
 */
export function ClientManager({ clients }: { clients: SavedClient[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = ui("en");
  const problems = draft ? validateClientParty(draft.party) : [];

  const onSave = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      // New clients go through the name-keyed upsert (so adding one you already
      // have updates it); edits address the row by id (so renaming works).
      const result =
        draft.id === null
          ? await saveClientAction(draft.party)
          : await updateClientAction(draft.id, draft.party);

      if (result.ok) setDraft(null);
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server — nothing was saved.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (client: SavedClient) => {
    if (!window.confirm(`Delete ${client.name}? Invoices you've already made keep their copy.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await deleteClientAction(client.id);
      if (!result.ok) setError(result.error);
      else if (draft?.id === client.id) setDraft(null);
    } catch {
      setError("Couldn't reach the server — nothing was deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Saved clients</h1>
          <p className="text-sm text-neutral-500">
            Reusable bill-to details. Pick one while editing an invoice instead
            of retyping it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ id: null, party: emptyParty() })}
          className="shrink-0 rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
        >
          Add client
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-overdue">
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">
            {draft.id === null ? "New client" : `Editing ${draft.party.name}`}
          </h2>

          <PartyFields
            party={draft.party}
            onChange={(partial) =>
              setDraft({ ...draft, party: { ...draft.party, ...partial } })
            }
            s={s}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={busy || problems.length > 0}
              title={problems[0]}
              className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50 dark:bg-white dark:text-ink"
            >
              {busy ? "Saving…" : "Save client"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            {problems.length > 0 && (
              <span className="text-xs text-neutral-400">{problems[0]}</span>
            )}
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No saved clients yet. Add one here, or fill in an invoice’s bill-to and
          hit “Save client”.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium">VAT number</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <td className="px-4 py-3 font-medium">{client.name}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {client.party.email || <Blank />}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {client.party.country || <Blank />}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {client.party.vatNumber || <Blank />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setDraft({ id: client.id, party: { ...client.party } })
                        }
                        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDelete(client)}
                        className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-overdue hover:text-overdue disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Blank() {
  return <span className="text-neutral-400">—</span>;
}
