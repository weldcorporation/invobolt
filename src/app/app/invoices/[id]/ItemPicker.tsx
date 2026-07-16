"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/currency";
import type { SavedItem } from "@/lib/items";

interface Props {
  items: SavedItem[];
  /** The invoice's currency — items priced in another one insert without a price. */
  invoiceCurrency: string;
  onPick: (item: SavedItem) => void;
}

/**
 * The saved-item picker, injected into `InvoiceForm`'s line-items section.
 * Picking appends a line with a *copy* of the item's values — the invoice
 * keeps its own snapshot, exactly like picking a saved client.
 */
export function ItemPicker({ items, invoiceCurrency, onPick }: Props) {
  const hasForeignCurrency = items.some((i) => i.currency !== invoiceCurrency);

  const onSelect = (id: string) => {
    const picked = items.find((i) => i.id === id);
    if (picked) onPick(picked);
  };

  return (
    <div className="mb-3 space-y-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
      <select
        // Selects an item to copy in; it does not track anything. Resetting to
        // "" after each pick keeps it honest about that (see ClientPicker).
        value=""
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      >
        <option value="">Add from a saved item…</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.description} —{" "}
            {formatMoney(item.unitPriceCents / 100, item.currency)}
            {item.currency !== invoiceCurrency ? ` (${item.currency})` : ""}
          </option>
        ))}
      </select>

      <p className="text-[11px] text-neutral-400">
        {hasForeignCurrency ? (
          <>
            Items priced in another currency insert without a price — a{" "}
            {invoiceCurrency} invoice shouldn&rsquo;t silently reuse a foreign
            number.
          </>
        ) : (
          <>
            From your{" "}
            <Link href="/app/import" className="underline hover:text-neutral-500">
              imported items
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
