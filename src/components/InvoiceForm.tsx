"use client";

/** The editing surface. Pure controlled component: it renders `invoice` and
 *  reports every change up via `onChange`. All persistence and export logic
 *  lives in the page. */

import type { ChangeEvent } from "react";
import type { Invoice, LineItem, Locale, Party, TemplateId, VatMode } from "@/lib/types";
import { CURRENCIES } from "@/lib/currency";
import { ui } from "@/lib/i18n";
import { emptyItem } from "@/lib/sample";
import { Field, Section, Select, TextArea, TextInput } from "./ui";

interface Props {
  invoice: Invoice;
  onChange: (next: Invoice) => void;
  uiLocale: Locale;
}

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "modern", label: "Modern" },
  { id: "classic", label: "Classic" },
  { id: "minimal", label: "Minimal" },
];

export function InvoiceForm({ invoice, onChange, uiLocale }: Props) {
  const s = ui(uiLocale);

  const patch = (partial: Partial<Invoice>) =>
    onChange({ ...invoice, ...partial });

  const patchParty = (key: "seller" | "client", partial: Partial<Party>) =>
    onChange({ ...invoice, [key]: { ...invoice[key], ...partial } });

  const patchItem = (id: string, partial: Partial<LineItem>) =>
    onChange({
      ...invoice,
      items: invoice.items.map((it) =>
        it.id === id ? { ...it, ...partial } : it,
      ),
    });

  const addItem = () =>
    onChange({ ...invoice, items: [...invoice.items, emptyItem()] });

  const removeItem = (id: string) =>
    onChange({
      ...invoice,
      items: invoice.items.filter((it) => it.id !== id),
    });

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch({ logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="space-y-4">
      {/* Design */}
      <Section title={s.design}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={s.template}>
            <Select
              value={invoice.template}
              onChange={(e) =>
                patch({ template: e.target.value as TemplateId })
              }
            >
              {TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.language}>
            <Select
              value={invoice.locale}
              onChange={(e) => patch({ locale: e.target.value as Locale })}
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
            </Select>
          </Field>
          <Field label={s.currency}>
            <Select
              value={invoice.currency}
              onChange={(e) => patch({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.accent}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={invoice.accentColor}
                onChange={(e) => patch({ accentColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-neutral-300 bg-white dark:border-neutral-700"
                aria-label={s.accent}
              />
              <TextInput
                value={invoice.accentColor}
                onChange={(e) => patch({ accentColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <Field label={s.logo}>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={onLogo}
                className="text-xs text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-xs file:font-medium hover:file:bg-neutral-200 dark:text-neutral-400 dark:file:bg-neutral-800"
              />
              {invoice.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => patch({ logoDataUrl: undefined })}
                  className="text-xs font-medium text-overdue hover:underline"
                >
                  {s.removeLogo}
                </button>
              )}
            </div>
          </Field>
        </div>
      </Section>

      {/* Seller */}
      <Section title={s.yourBusiness}>
        <PartyFields
          party={invoice.seller}
          onChange={(p) => patchParty("seller", p)}
          s={s}
        />
      </Section>

      {/* Client */}
      <Section title={s.billTo}>
        <PartyFields
          party={invoice.client}
          onChange={(p) => patchParty("client", p)}
          s={s}
        />
      </Section>

      {/* Invoice details */}
      <Section title={s.invoiceDetails}>
        <div className="grid grid-cols-3 gap-3">
          <Field label={s.invoiceDetails} className="col-span-3">
            <TextInput
              value={invoice.number}
              onChange={(e) => patch({ number: e.target.value })}
              placeholder="2026-001"
            />
          </Field>
          <Field label="Issue date">
            <TextInput
              type="date"
              value={invoice.issueDate}
              onChange={(e) => patch({ issueDate: e.target.value })}
            />
          </Field>
          <Field label="Due date">
            <TextInput
              type="date"
              value={invoice.dueDate}
              onChange={(e) => patch({ dueDate: e.target.value })}
            />
          </Field>
          <Field label={s.discountPercent}>
            <TextInput
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={invoice.discountPercent}
              onChange={(e) => patch({ discountPercent: num(e.target.value) })}
            />
          </Field>
        </div>
      </Section>

      {/* Line items */}
      <Section title={s.lineItems}>
        <div className="space-y-2">
          {invoice.items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-12 items-end gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <Field label="" className="col-span-12">
                <TextInput
                  value={it.description}
                  onChange={(e) =>
                    patchItem(it.id, { description: e.target.value })
                  }
                  placeholder="Description"
                />
              </Field>
              <Field label="Qty" className="col-span-3">
                <TextInput
                  type="number"
                  step="any"
                  value={it.quantity}
                  onChange={(e) =>
                    patchItem(it.id, { quantity: num(e.target.value) })
                  }
                />
              </Field>
              <Field label="Unit price" className="col-span-4">
                <TextInput
                  type="number"
                  step="any"
                  value={it.unitPrice}
                  onChange={(e) =>
                    patchItem(it.id, { unitPrice: num(e.target.value) })
                  }
                />
              </Field>
              <Field label="VAT %" className="col-span-3">
                <TextInput
                  type="number"
                  step="any"
                  value={it.vatRate}
                  disabled={invoice.vatMode !== "standard"}
                  onChange={(e) =>
                    patchItem(it.id, { vatRate: num(e.target.value) })
                  }
                />
              </Field>
              <div className="col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  disabled={invoice.items.length === 1}
                  className="rounded-md px-2 py-2 text-xs font-medium text-overdue hover:bg-overdue/10 disabled:opacity-30"
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-3 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 hover:border-bolt-amber hover:text-bolt-amberDark dark:border-neutral-700 dark:text-neutral-300"
        >
          + {s.addItem}
        </button>
      </Section>

      {/* VAT handling */}
      <Section title={s.vatHandling}>
        <Field label={s.vatHandling}>
          <Select
            value={invoice.vatMode}
            onChange={(e) => patch({ vatMode: e.target.value as VatMode })}
          >
            <option value="standard">{s.vatModeStandard}</option>
            <option value="reverse">{s.vatModeReverse}</option>
            <option value="exempt">{s.vatModeExempt}</option>
          </Select>
        </Field>
      </Section>

      {/* Notes & payment */}
      <Section title={s.notesPayment}>
        <div className="space-y-3">
          <Field label="Notes">
            <TextArea
              rows={2}
              value={invoice.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
          <Field label="Payment terms">
            <TextArea
              rows={2}
              value={invoice.paymentTerms}
              onChange={(e) => patch({ paymentTerms: e.target.value })}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function PartyFields({
  party,
  onChange,
  s,
}: {
  party: Party;
  onChange: (partial: Partial<Party>) => void;
  s: ReturnType<typeof ui>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={s.name} className="col-span-2">
        <TextInput
          value={party.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field label={s.address} className="col-span-2">
        <TextArea
          rows={3}
          value={party.address}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>
      <Field label={s.email}>
        <TextInput
          type="email"
          value={party.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <Field label={s.country}>
        <TextInput
          value={party.country}
          onChange={(e) => onChange({ country: e.target.value })}
        />
      </Field>
      <Field label={s.vatNumber} className="col-span-2">
        <TextInput
          value={party.vatNumber}
          onChange={(e) => onChange({ vatNumber: e.target.value })}
        />
      </Field>
    </div>
  );
}
