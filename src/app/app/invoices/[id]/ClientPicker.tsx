"use client";

import { useState } from "react";
import Link from "next/link";
import { validateClientParty } from "@/lib/party";
import type { SavedClient } from "@/lib/clients";
import type { Party } from "@/lib/types";
import { saveClientAction } from "../../actions";

interface Props {
  clients: SavedClient[];
  /** The invoice's current bill-to party. */
  party: Party;
  onPick: (party: Party) => void;
}

/**
 * The saved-client picker, injected into `InvoiceForm`'s bill-to section.
 *
 * Picking fills the invoice's client fields with a *copy* of the saved party —
 * the invoice keeps its own snapshot, so later editing a saved client never
 * rewrites history on invoices already sent.
 */
export function ClientPicker({ clients, party, onPick }: Props) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const problems = validateClientParty(party);

  const onSelect = (id: string) => {
    const picked = clients.find((c) => c.id === id);
    if (!picked) return;
    setNote(null);
    onPick({ ...picked.party });
  };

  const onSave = async () => {
    setSaving(true);
    setNote(null);
    try {
      const result = await saveClientAction(party);
      setNote(
        result.ok
          ? `Saved “${result.client.name}” to your clients.`
          : result.error,
      );
    } catch {
      setNote("Couldn't reach the server — the client isn't saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 space-y-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <select
          // Deliberately uncontrolled-ish: this selects a client to copy in, it
          // does not track "which client this invoice is". Resetting to "" after
          // each pick keeps it honest about that.
          value=""
          onChange={(e) => onSelect(e.target.value)}
          disabled={clients.length === 0}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">
            {clients.length === 0
              ? "No saved clients yet"
              : "Fill from a saved client…"}
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || problems.length > 0}
          title={problems[0]}
          className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {saving ? "…" : "Save client"}
        </button>
      </div>

      <p className="text-[11px] text-neutral-400">
        {note ?? (
          <>
            Saving stores this bill-to under its name, replacing any client you
            already have with that name.{" "}
            <Link href="/app/clients" className="underline hover:text-neutral-500">
              Manage clients
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
