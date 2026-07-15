"use client";

import { useEffect, useMemo, useState } from "react";
import type { Invoice, Locale } from "@/lib/types";
import { sampleInvoice } from "@/lib/sample";
import { ui } from "@/lib/i18n";
import { applyProfile } from "@/lib/profile";
import { clearProfile, loadProfile, saveProfile } from "@/lib/storage";
import { InvoiceForm } from "@/components/InvoiceForm";
import { InvoiceDocument } from "@/components/InvoiceDocument";

/** yyyy-mm-dd for a date `days` from now (computed on the client only). */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  // Seed with deterministic empty dates so server and first client render
  // match; real dates + any saved profile are filled in after mount.
  const [invoice, setInvoice] = useState<Invoice>(() =>
    sampleInvoice("", ""),
  );
  const [uiLocale, setUiLocale] = useState<Locale>("en");
  const [savedFlash, setSavedFlash] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Client-only hydration: real dates (browser clock) and any saved profile
  // (localStorage) can't exist during SSR, so we seed them once after mount.
  // Setting state here is the intended pattern for reading browser-only state.
  useEffect(() => {
    const withDates = sampleInvoice(isoOffset(0), isoOffset(14));
    const profile = loadProfile();
    const seeded = profile ? applyProfile(withDates, profile) : withDates;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvoice(seeded);
    if (profile) setUiLocale(profile.locale);
    setHydrated(true);
  }, []);

  const s = ui(uiLocale);

  const onSaveProfile = () => {
    saveProfile(invoice);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const onClearProfile = () => {
    clearProfile();
    setSavedFlash(false);
  };

  const onReset = () => {
    if (!window.confirm(s.newInvoiceConfirm)) return;
    const fresh = sampleInvoice(isoOffset(0), isoOffset(14));
    const profile = loadProfile();
    setInvoice(profile ? applyProfile(fresh, profile) : fresh);
  };

  const onExport = () => window.print();

  const preview = useMemo(
    () => <InvoiceDocument invoice={invoice} />,
    [invoice],
  );

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="no-print sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="Invobolt" width={28} height={28} />
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight">Invobolt</div>
              <div className="text-[11px] text-neutral-500">{s.tagline}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-1 hidden items-center rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-700 sm:flex">
              {(["en", "nl"] as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setUiLocale(l)}
                  className={`rounded px-2 py-1 font-medium uppercase ${
                    uiLocale === l
                      ? "bg-ink text-white dark:bg-white dark:text-ink"
                      : "text-neutral-500"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {s.reset}
            </button>
            <button
              type="button"
              onClick={onSaveProfile}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {savedFlash ? `✓ ${s.profileSaved}` : s.saveProfile}
            </button>
            <button
              type="button"
              onClick={onExport}
              className="rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
            >
              ⚡ {s.exportPdf}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* Editor */}
        <div className="no-print">
          <p className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-paid" />
            {s.privacyNote}
          </p>
          <InvoiceForm
            invoice={invoice}
            onChange={setInvoice}
            uiLocale={uiLocale}
          />
          {hydrated && loadProfile() && (
            <button
              type="button"
              onClick={onClearProfile}
              className="no-print mt-3 text-xs font-medium text-neutral-400 hover:text-overdue"
            >
              {s.clearProfile}
            </button>
          )}
        </div>

        {/* Live preview */}
        <div className="print-root">
          <div className="mx-auto w-full max-w-[820px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200 dark:ring-neutral-800">
            <div style={{ visibility: hydrated ? "visible" : "hidden" }}>
              {preview}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
