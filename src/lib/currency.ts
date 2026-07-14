/** Currency helpers built on the platform Intl API — no dependencies. */

export interface CurrencyOption {
  code: string;
  label: string;
}

/** A pragmatic short list; anyone can extend it — it is just data. */
export const CURRENCIES: CurrencyOption[] = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "DKK", label: "Danish Krone (kr)" },
  { code: "NOK", label: "Norwegian Krone (kr)" },
  { code: "PLN", label: "Polish Złoty (zł)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
];

/**
 * Format an amount in the given currency, localised.
 * Falls back gracefully if the runtime doesn't know the currency code.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale: string = "en",
): string {
  const bcp47 = locale === "nl" ? "nl-NL" : "en-IE";
  try {
    return new Intl.NumberFormat(bcp47, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Just the currency symbol (or code) for compact display. */
export function currencySymbol(currency: string, locale: string = "en"): string {
  const bcp47 = locale === "nl" ? "nl-NL" : "en-IE";
  try {
    const parts = new Intl.NumberFormat(bcp47, {
      style: "currency",
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
