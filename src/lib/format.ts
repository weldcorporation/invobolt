/** Locale-aware date formatting for the invoice document. */

import type { Locale } from "./types";

export function formatDate(iso: string, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const bcp47 = locale === "nl" ? "nl-NL" : "en-GB";
  return new Intl.DateTimeFormat(bcp47, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
