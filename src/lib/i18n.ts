/**
 * Tiny hand-rolled i18n. Two audiences use these strings:
 *  - the app chrome (form labels, buttons) — follows the UI language;
 *  - the invoice document itself — follows invoice.locale, so a Dutch invoice
 *    reads correctly even if the UI is in English.
 *
 * No i18n library on purpose: the surface is small and this keeps the bundle
 * lean and the contribution path (add a locale = add an object) obvious.
 */

import type { Locale, VatMode } from "./types";

export interface Dict {
  // Document (printed on the invoice)
  invoice: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  from: string;
  billTo: string;
  vatNumber: string;
  description: string;
  qty: string;
  unitPrice: string;
  vat: string;
  amount: string;
  subtotal: string;
  discount: string;
  total: string;
  amountDue: string;
  notes: string;
  paymentTerms: string;
  reverseChargeNote: string;
  exemptNote: string;
  page: string;
}

const en: Dict = {
  invoice: "Invoice",
  invoiceNumber: "Invoice no.",
  issueDate: "Issue date",
  dueDate: "Due date",
  from: "From",
  billTo: "Bill to",
  vatNumber: "VAT no.",
  description: "Description",
  qty: "Qty",
  unitPrice: "Unit price",
  vat: "VAT",
  amount: "Amount",
  subtotal: "Subtotal",
  discount: "Discount",
  total: "Total",
  amountDue: "Amount due",
  notes: "Notes",
  paymentTerms: "Payment",
  reverseChargeNote: "VAT reverse-charged — to be accounted for by the recipient.",
  exemptNote: "VAT exempt.",
  page: "Page",
};

const nl: Dict = {
  invoice: "Factuur",
  invoiceNumber: "Factuurnr.",
  issueDate: "Factuurdatum",
  dueDate: "Vervaldatum",
  from: "Van",
  billTo: "Factuur aan",
  vatNumber: "Btw-nr.",
  description: "Omschrijving",
  qty: "Aantal",
  unitPrice: "Stukprijs",
  vat: "Btw",
  amount: "Bedrag",
  subtotal: "Subtotaal",
  discount: "Korting",
  total: "Totaal",
  amountDue: "Te betalen",
  notes: "Opmerkingen",
  paymentTerms: "Betaling",
  reverseChargeNote: "Btw verlegd — te voldoen door de ontvanger.",
  exemptNote: "Vrijgesteld van btw.",
  page: "Pagina",
};

export const DICTS: Record<Locale, Dict> = { en, nl };

export function t(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}

/** UI chrome strings (the app around the invoice). */
export interface UIStrings {
  tagline: string;
  yourBusiness: string;
  billTo: string;
  invoiceDetails: string;
  lineItems: string;
  addItem: string;
  vatHandling: string;
  notesPayment: string;
  design: string;
  template: string;
  language: string;
  currency: string;
  accent: string;
  saveProfile: string;
  profileSaved: string;
  clearProfile: string;
  exportPdf: string;
  reset: string;
  privacyNote: string;
  name: string;
  address: string;
  email: string;
  country: string;
  vatNumber: string;
  vatModeStandard: string;
  vatModeReverse: string;
  vatModeExempt: string;
  discountPercent: string;
  logo: string;
  removeLogo: string;
  newInvoiceConfirm: string;
}

const uiEn: UIStrings = {
  tagline: "Invoices in a bolt.",
  yourBusiness: "Your business",
  billTo: "Bill to",
  invoiceDetails: "Invoice details",
  lineItems: "Line items",
  addItem: "Add item",
  vatHandling: "VAT handling",
  notesPayment: "Notes & payment",
  design: "Design",
  template: "Template",
  language: "Invoice language",
  currency: "Currency",
  accent: "Accent colour",
  saveProfile: "Save business profile",
  profileSaved: "Saved on this device",
  clearProfile: "Forget",
  exportPdf: "Export PDF",
  reset: "New invoice",
  privacyNote: "Private by default — nothing leaves your browser.",
  name: "Name",
  address: "Address",
  email: "Email",
  country: "Country",
  vatNumber: "VAT number",
  vatModeStandard: "Standard VAT",
  vatModeReverse: "Reverse charge (EU B2B)",
  vatModeExempt: "No VAT / exempt",
  discountPercent: "Discount %",
  logo: "Logo",
  removeLogo: "Remove",
  newInvoiceConfirm: "Start a new invoice? Unsaved details will be cleared.",
};

const uiNl: UIStrings = {
  tagline: "Facturen in een flits.",
  yourBusiness: "Jouw bedrijf",
  billTo: "Factuur aan",
  invoiceDetails: "Factuurgegevens",
  lineItems: "Regels",
  addItem: "Regel toevoegen",
  vatHandling: "Btw-behandeling",
  notesPayment: "Opmerkingen & betaling",
  design: "Ontwerp",
  template: "Sjabloon",
  language: "Factuurtaal",
  currency: "Valuta",
  accent: "Accentkleur",
  saveProfile: "Bedrijfsprofiel opslaan",
  profileSaved: "Opgeslagen op dit apparaat",
  clearProfile: "Vergeten",
  exportPdf: "Exporteer pdf",
  reset: "Nieuwe factuur",
  privacyNote: "Privé by default — er verlaat niets je browser.",
  name: "Naam",
  address: "Adres",
  email: "E-mail",
  country: "Land",
  vatNumber: "Btw-nummer",
  vatModeStandard: "Standaard btw",
  vatModeReverse: "Btw verlegd (EU B2B)",
  vatModeExempt: "Geen btw / vrijgesteld",
  discountPercent: "Korting %",
  logo: "Logo",
  removeLogo: "Verwijderen",
  newInvoiceConfirm: "Nieuwe factuur starten? Niet-opgeslagen gegevens worden gewist.",
};

export const UI: Record<Locale, UIStrings> = { en: uiEn, nl: uiNl };

export function ui(locale: Locale): UIStrings {
  return UI[locale] ?? uiEn;
}

export function vatModeLabel(mode: VatMode, locale: Locale): string {
  const s = ui(locale);
  switch (mode) {
    case "reverse":
      return s.vatModeReverse;
    case "exempt":
      return s.vatModeExempt;
    default:
      return s.vatModeStandard;
  }
}
