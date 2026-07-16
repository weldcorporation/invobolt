"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { SavedItem } from "@/lib/items";
import {
  deleteItemAction,
  importStripeClientsAction,
  importStripeItemsAction,
  previewStripeAction,
  type StripePreview,
} from "./actions";

interface Props {
  hasServerKey: boolean;
  savedItems: SavedItem[];
}

/**
 * The paste-key import flow. The key lives in component state for exactly as
 * long as the preview call takes — it is not persisted anywhere, which is the
 * whole design (see docs/v0.3-design.md).
 */
export function StripeImport({ hasServerKey, savedItems }: Props) {
  const [key, setKey] = useState("");
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<StripePreview | null>(null);
  const [pickedCustomers, setPickedCustomers] = useState<Set<string>>(new Set());
  const [pickedItems, setPickedItems] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const more = preview
    ? preview.customersCursor !== null || preview.itemsCursor !== null
    : false;

  /**
   * Fetch a batch. `cursors` resumes where the last batch stopped; omitting
   * them starts over.
   *
   * The key is handed to the action and dropped from state in the same breath.
   * It is needed to *read* from Stripe and nothing else — importing the rows
   * afterwards never sees it — so holding it for the page's lifetime would be
   * keeping a credential we have no further use for. A next batch asks for it
   * again, which makes every read of someone's Stripe account a deliberate act.
   */
  const fetchBatch = async (cursors?: {
    customersAfter: string | null;
    itemsAfter: string | null;
  }) => {
    const submitted = key;
    setKey("");
    setFetching(true);
    setError(null);
    setNote(null);
    try {
      const result = await previewStripeAction(submitted, cursors);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview((current) =>
        cursors && current
          ? {
              // Appending, not replacing: the earlier batch is still on screen
              // and may still be selected.
              customers: [...current.customers, ...result.customers],
              items: [...current.items, ...result.items],
              customersCursor: result.customersCursor,
              itemsCursor: result.itemsCursor,
            }
          : result,
      );
      // Preselect what just arrived: the common case is "bring my Stripe over".
      setPickedCustomers((picked) => {
        const next = cursors ? new Set(picked) : new Set<string>();
        for (const c of result.customers) next.add(c.stripeCustomerId);
        return next;
      });
      setPickedItems((picked) => {
        const next = cursors ? new Set(picked) : new Set<string>();
        for (const i of result.items) next.add(i.stripePriceId);
        return next;
      });
    } catch {
      setError("Couldn't reach the server — nothing was fetched.");
    } finally {
      setFetching(false);
    }
  };

  const onFetch = () => fetchBatch();

  const onFetchMore = () =>
    fetchBatch({
      customersAfter: preview?.customersCursor ?? null,
      itemsAfter: preview?.itemsCursor ?? null,
    });

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const onImportClients = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const selection = preview.customers.filter((c) =>
        pickedCustomers.has(c.stripeCustomerId),
      );
      const result = await importStripeClientsAction(selection);
      if (result.ok) {
        setNote(
          `Imported ${result.imported} ${result.imported === 1 ? "client" : "clients"}.`,
        );
        // A skipped customer is not an error, but it must not pass silently:
        // the user asked for it and did not get it.
        setError(
          result.skipped.length > 0
            ? `Skipped ${result.skipped.join(", ")} — you already have a different client under that name. Rename one of them and import again.`
            : null,
        );
      } else setError(result.error);
    } catch {
      setError("Couldn't reach the server — nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  const onImportItems = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const selection = preview.items.filter((i) =>
        pickedItems.has(i.stripePriceId),
      );
      const result = await importStripeItemsAction(selection);
      if (result.ok) {
        setNote(
          `Imported ${result.imported} ${result.imported === 1 ? "item" : "items"}.`,
        );
      } else setError(result.error);
    } catch {
      setError("Couldn't reach the server — nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteItem = async (id: string) => {
    setError(null);
    try {
      const result = await deleteItemAction(id);
      if (!result.ok) setError(result.error);
    } catch {
      setError("Couldn't reach the server — the item wasn't deleted.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Import from Stripe</h1>
        <p className="text-sm text-neutral-500">
          Bring your Stripe customers in as saved clients, and your products as
          reusable line items.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <label
          htmlFor="stripe-key"
          className="text-xs font-medium uppercase tracking-wide text-neutral-400"
        >
          Restricted key
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="stripe-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasServerKey ? "rk_… (or leave empty to use this server's key)" : "rk_…"}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950"
          />
          <button
            type="button"
            disabled={fetching || (!key.trim() && !hasServerKey)}
            onClick={() => void onFetch()}
            className="shrink-0 rounded-md bg-bolt-amber px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-bolt-amberDark disabled:opacity-50"
          >
            {fetching ? "Fetching…" : "Fetch from Stripe"}
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">
          Create a <span className="font-medium">restricted</span> key in
          Stripe under Developers → API keys, with read access to Customers and
          Products — not your secret key. It is used for this import only and
          never stored.
        </p>
      </div>

      {(note || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`text-xs font-medium ${error ? "text-overdue" : "text-paid"}`}
        >
          {error ?? note}
        </p>
      )}

      {preview && (
        <>
          {more && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <p className="text-xs text-neutral-500">
                Stripe has more rows than one batch takes. Import these, then
                paste your key again to fetch the next batch — it picks up where
                this one stopped.
              </p>
              <button
                type="button"
                // Always needs a key, even where a server one is configured:
                // the next batch must come from the same account as this one.
                disabled={fetching || !key.trim()}
                onClick={() => void onFetchMore()}
                className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {fetching ? "…" : "Fetch the next batch"}
              </button>
            </div>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">
                Customers{" "}
                <span className="font-normal text-neutral-400">
                  {pickedCustomers.size}/{preview.customers.length} selected
                </span>
              </h2>
              <button
                type="button"
                disabled={busy || pickedCustomers.size === 0}
                onClick={() => void onImportClients()}
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {busy ? "…" : "Import as clients"}
              </button>
            </div>

            {preview.customers.length === 0 ? (
              <p className="text-xs text-neutral-400">
                No importable customers (a customer needs a name or an email).
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {preview.customers.map((customer) => (
                  <li key={customer.stripeCustomerId}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                      <input
                        type="checkbox"
                        checked={pickedCustomers.has(customer.stripeCustomerId)}
                        onChange={() =>
                          setPickedCustomers((set) =>
                            toggle(set, customer.stripeCustomerId),
                          )
                        }
                      />
                      <span className="font-medium">{customer.party.name}</span>
                      <span className="text-xs text-neutral-400">
                        {customer.party.email}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">
                Products{" "}
                <span className="font-normal text-neutral-400">
                  {pickedItems.size}/{preview.items.length} selected
                </span>
              </h2>
              <button
                type="button"
                disabled={busy || pickedItems.size === 0}
                onClick={() => void onImportItems()}
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {busy ? "…" : "Import as items"}
              </button>
            </div>

            {preview.items.length === 0 ? (
              <p className="text-xs text-neutral-400">
                No importable products (a product needs a name and a standard
                default price).
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {preview.items.map((item) => (
                  <li key={item.stripePriceId}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
                      <input
                        type="checkbox"
                        checked={pickedItems.has(item.stripePriceId)}
                        onChange={() =>
                          setPickedItems((set) => toggle(set, item.stripePriceId))
                        }
                      />
                      <span className="font-medium">{item.description}</span>
                      <span className="ml-auto text-xs tabular-nums text-neutral-500">
                        {formatMoney(item.unitPriceCents / 100, item.currency)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold">
          Saved items{" "}
          <span className="font-normal text-neutral-400">
            {savedItems.length}
          </span>
        </h2>
        {savedItems.length === 0 ? (
          <p className="text-xs text-neutral-400">
            Nothing saved yet. Imported products appear here and in the
            editor&rsquo;s line-item picker.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {savedItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-4 py-2 text-sm"
              >
                <span className="font-medium">{item.description}</span>
                <span className="ml-auto text-xs tabular-nums text-neutral-500">
                  {formatMoney(item.unitPriceCents / 100, item.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => void onDeleteItem(item.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-overdue hover:bg-overdue/10"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
