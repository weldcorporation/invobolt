"use client";

/**
 * The recipient's only control. Printing is the point of this page — the print
 * stylesheet isolates the sheet, so "Save as PDF" gives them exactly what the
 * sender sees — and Ctrl+P is not discoverable enough to rely on.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md bg-bolt-amber px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-bolt-amberDark"
    >
      ⚡ {label}
    </button>
  );
}
