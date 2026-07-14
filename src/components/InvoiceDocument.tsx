/**
 * The printable invoice document. Three templates share the same data and
 * totals; each is a self-contained A4 sheet. The user's invoice is the hero —
 * templates stay restrained (see Brand Kit: "Don't over-brand exports").
 *
 * Amounts use `.tnum` (tabular figures) so columns line up to the cent.
 */

import type { Invoice } from "@/lib/types";
import { computeTotals, type InvoiceTotals } from "@/lib/calc";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";

interface DocProps {
  invoice: Invoice;
}

function taxNote(invoice: Invoice): string | null {
  const d = t(invoice.locale);
  if (invoice.vatMode === "reverse") return d.reverseChargeNote;
  if (invoice.vatMode === "exempt") return d.exemptNote;
  return null;
}

/** Renders multi-line address text, preserving line breaks. */
function AddressLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i}>{line || " "}</div>
      ))}
    </>
  );
}

export function InvoiceDocument({ invoice }: DocProps) {
  const totals = computeTotals(invoice);
  switch (invoice.template) {
    case "classic":
      return <ClassicTemplate invoice={invoice} totals={totals} />;
    case "minimal":
      return <MinimalTemplate invoice={invoice} totals={totals} />;
    case "modern":
    default:
      return <ModernTemplate invoice={invoice} totals={totals} />;
  }
}

interface TemplateProps {
  invoice: Invoice;
  totals: InvoiceTotals;
}

/* ------------------------------------------------------------------ */
/* Shared totals block                                                 */
/* ------------------------------------------------------------------ */

function Totals({ invoice, totals }: TemplateProps) {
  const d = t(invoice.locale);
  const money = (n: number) => formatMoney(n, invoice.currency, invoice.locale);
  return (
    <div className="ml-auto w-full max-w-[280px] text-sm">
      <div className="flex justify-between py-1">
        <span className="text-neutral-500">{d.subtotal}</span>
        <span className="tnum">{money(totals.subtotal)}</span>
      </div>
      {totals.discount > 0 && (
        <div className="flex justify-between py-1">
          <span className="text-neutral-500">{d.discount}</span>
          <span className="tnum">−{money(totals.discount)}</span>
        </div>
      )}
      {invoice.vatMode === "standard" &&
        totals.vatBuckets.map((b) => (
          <div key={b.rate} className="flex justify-between py-1">
            <span className="text-neutral-500">
              {d.vat} {b.rate}%
            </span>
            <span className="tnum">{money(b.vat)}</span>
          </div>
        ))}
      <div
        className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"
        style={{ borderColor: invoice.accentColor }}
      >
        <span>{d.amountDue}</span>
        <span className="tnum">{money(totals.total)}</span>
      </div>
    </div>
  );
}

function ItemsHead({ invoice }: { invoice: Invoice }) {
  const d = t(invoice.locale);
  const showVat = invoice.vatMode === "standard";
  return (
    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-neutral-500">
      <th className="py-2 pr-2 font-medium">{d.description}</th>
      <th className="py-2 px-2 text-right font-medium">{d.qty}</th>
      <th className="py-2 px-2 text-right font-medium">{d.unitPrice}</th>
      {showVat && <th className="py-2 px-2 text-right font-medium">{d.vat}</th>}
      <th className="py-2 pl-2 text-right font-medium">{d.amount}</th>
    </tr>
  );
}

function ItemRows({ invoice }: { invoice: Invoice }) {
  const showVat = invoice.vatMode === "standard";
  const money = (n: number) => formatMoney(n, invoice.currency, invoice.locale);
  return (
    <>
      {invoice.items.map((it) => (
        <tr key={it.id} className="border-b border-neutral-100 align-top">
          <td className="py-2 pr-2">{it.description || "—"}</td>
          <td className="py-2 px-2 text-right tnum">{it.quantity}</td>
          <td className="py-2 px-2 text-right tnum">{money(it.unitPrice)}</td>
          {showVat && (
            <td className="py-2 px-2 text-right tnum">{it.vatRate}%</td>
          )}
          <td className="py-2 pl-2 text-right tnum">
            {money(it.quantity * it.unitPrice)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Meta({ invoice }: { invoice: Invoice }) {
  const d = t(invoice.locale);
  return (
    <div className="text-sm">
      <div className="flex gap-2">
        <span className="text-neutral-500">{d.invoiceNumber}</span>
        <span className="font-medium">{invoice.number}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">{d.issueDate}</span>
        <span>{formatDate(invoice.issueDate, invoice.locale)}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">{d.dueDate}</span>
        <span>{formatDate(invoice.dueDate, invoice.locale)}</span>
      </div>
    </div>
  );
}

function Footer({ invoice }: { invoice: Invoice }) {
  const d = t(invoice.locale);
  const note = taxNote(invoice);
  return (
    <div className="mt-8 space-y-3 text-sm text-neutral-600">
      {note && <p className="italic">{note}</p>}
      {invoice.notes && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            {d.notes}
          </div>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
      {invoice.paymentTerms && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            {d.paymentTerms}
          </div>
          <p className="whitespace-pre-line">{invoice.paymentTerms}</p>
        </div>
      )}
    </div>
  );
}

function Logo({ invoice, className }: { invoice: Invoice; className?: string }) {
  if (!invoice.logoDataUrl) return null;
  // A plain <img> is deliberate: the logo is a local data: URL that never hits
  // the network, so next/image optimization brings nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={invoice.logoDataUrl} alt="" className={className ?? "max-h-16 max-w-[180px] object-contain"} />;
}

/* ------------------------------------------------------------------ */
/* Modern — accent header band                                         */
/* ------------------------------------------------------------------ */

function ModernTemplate({ invoice, totals }: TemplateProps) {
  const d = t(invoice.locale);
  return (
    <div className="invoice-sheet flex min-h-full flex-col bg-white p-12 text-ink">
      <div className="flex items-start justify-between">
        <div>
          <Logo invoice={invoice} />
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: invoice.accentColor }}
          >
            {d.invoice}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{invoice.seller.name}</div>
          <div className="mt-1 text-sm text-neutral-500">
            <AddressLines text={invoice.seller.address} />
          </div>
          {invoice.seller.vatNumber && (
            <div className="mt-1 text-sm text-neutral-500">
              {d.vatNumber} {invoice.seller.vatNumber}
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-8 flex items-start justify-between rounded-lg px-5 py-4"
        style={{ backgroundColor: hexWithAlpha(invoice.accentColor, 0.12) }}
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            {d.billTo}
          </div>
          <div className="mt-1 font-medium">{invoice.client.name}</div>
          <div className="text-sm text-neutral-600">
            <AddressLines text={invoice.client.address} />
          </div>
          {invoice.client.vatNumber && (
            <div className="text-sm text-neutral-600">
              {d.vatNumber} {invoice.client.vatNumber}
            </div>
          )}
        </div>
        <Meta invoice={invoice} />
      </div>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <ItemsHead invoice={invoice} />
        </thead>
        <tbody>
          <ItemRows invoice={invoice} />
        </tbody>
      </table>

      <div className="mt-6">
        <Totals invoice={invoice} totals={totals} />
      </div>

      <Footer invoice={invoice} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Classic — serif-ish, ruled, formal                                  */
/* ------------------------------------------------------------------ */

function ClassicTemplate({ invoice, totals }: TemplateProps) {
  const d = t(invoice.locale);
  return (
    <div className="invoice-sheet flex min-h-full flex-col bg-white p-12 text-ink">
      <div className="flex items-center justify-between border-b-2 border-ink pb-4">
        <div className="flex items-center gap-3">
          <Logo invoice={invoice} className="max-h-12 max-w-[140px] object-contain" />
          <div>
            <div className="text-xl font-bold">{invoice.seller.name}</div>
            <div className="text-xs text-neutral-500">
              {invoice.seller.email}
            </div>
          </div>
        </div>
        <h1 className="text-2xl font-bold uppercase tracking-widest">
          {d.invoice}
        </h1>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-8">
        <div className="text-sm">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            {d.from}
          </div>
          <div className="mt-1 font-medium">{invoice.seller.name}</div>
          <div className="text-neutral-600">
            <AddressLines text={invoice.seller.address} />
          </div>
          {invoice.seller.vatNumber && (
            <div className="text-neutral-600">
              {d.vatNumber} {invoice.seller.vatNumber}
            </div>
          )}
        </div>
        <div className="text-sm">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            {d.billTo}
          </div>
          <div className="mt-1 font-medium">{invoice.client.name}</div>
          <div className="text-neutral-600">
            <AddressLines text={invoice.client.address} />
          </div>
          {invoice.client.vatNumber && (
            <div className="text-neutral-600">
              {d.vatNumber} {invoice.client.vatNumber}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 border-y py-3">
        <Meta invoice={invoice} />
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <ItemsHead invoice={invoice} />
        </thead>
        <tbody>
          <ItemRows invoice={invoice} />
        </tbody>
      </table>

      <div className="mt-6">
        <Totals invoice={invoice} totals={totals} />
      </div>

      <Footer invoice={invoice} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Minimal — airy, monochrome, lots of whitespace                      */
/* ------------------------------------------------------------------ */

function MinimalTemplate({ invoice, totals }: TemplateProps) {
  const d = t(invoice.locale);
  return (
    <div className="invoice-sheet flex min-h-full flex-col bg-white p-14 text-ink">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-400">
          {d.invoice}
        </h1>
        <div className="tnum text-sm text-neutral-500">{invoice.number}</div>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-6 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            {d.from}
          </div>
          <div className="mt-1 font-medium">{invoice.seller.name}</div>
          <div className="text-neutral-600">
            <AddressLines text={invoice.seller.address} />
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            {d.billTo}
          </div>
          <div className="mt-1 font-medium">{invoice.client.name}</div>
          <div className="text-neutral-600">
            <AddressLines text={invoice.client.address} />
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            {d.issueDate}
          </div>
          <div className="mt-1">{formatDate(invoice.issueDate, invoice.locale)}</div>
          <div className="mt-3 text-[11px] uppercase tracking-wide text-neutral-400">
            {d.dueDate}
          </div>
          <div className="mt-1">{formatDate(invoice.dueDate, invoice.locale)}</div>
        </div>
      </div>

      <table className="mt-10 w-full border-collapse text-sm">
        <thead>
          <ItemsHead invoice={invoice} />
        </thead>
        <tbody>
          <ItemRows invoice={invoice} />
        </tbody>
      </table>

      <div className="mt-8">
        <Totals invoice={invoice} totals={totals} />
      </div>

      <Footer invoice={invoice} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Expand a #RRGGBB hex to an rgba() string with the given alpha. */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(245, 165, 36, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
