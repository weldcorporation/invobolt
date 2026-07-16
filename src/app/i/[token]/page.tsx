import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { getSharedInvoice } from "@/lib/invoices";
import { ui } from "@/lib/i18n";
import { isWorkspaceEnabled } from "@/lib/workspace";
import { PrintButton } from "./PrintButton";

/**
 * Never cached.
 *
 * The design sketched this route as "server, cached", but caching a capability
 * URL breaks the thing that makes the capability safe: a revoked token has to
 * stop resolving *now*, and a cached HTML response would keep serving the
 * invoice to a link the sender believes they killed. The same applies to edits
 * — the recipient should see the invoice as it is, not as it was. The cost is
 * one indexed lookup on a unique column per view, which is the right trade for
 * revocation that actually revokes.
 */
export const dynamic = "force-dynamic";

/**
 * Keep share links out of search results. They are unguessable, but they do get
 * pasted into places that get crawled, and an indexed invoice would defeat the
 * whole model.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  // Don't inherit the marketing OG tags from the root layout onto someone's
  // invoice — there's nothing here to share onward.
  openGraph: undefined,
};

/**
 * The recipient's view: a read-only invoice, no app chrome, no account.
 *
 * Renders the very same `InvoiceDocument` the sender sees in their editor, so
 * there is no second template to keep in sync and no way for the two to drift.
 */
export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // With workspace mode off, this route doesn't exist at all — same as /app.
  if (!isWorkspaceEnabled()) notFound();

  const { token } = await params;
  const shared = await getSharedInvoice(token);

  // Unknown, malformed, and revoked tokens are all just "not found": telling
  // them apart would confirm to a guesser which tokens once existed.
  if (!shared) notFound();

  const s = ui(shared.document.locale);

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-6 dark:bg-neutral-950">
      <div className="mx-auto flex max-w-[820px] items-center justify-between gap-4 pb-4">
        <Link
          href="/"
          className="no-print flex items-center gap-2 text-sm text-neutral-500 hover:text-ink dark:hover:text-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={20} height={20} />
          <span className="font-medium">Invobolt</span>
        </Link>
        <div className="no-print flex items-center gap-2">
          {/* Sender-provided and validated as https-only on write (see
              lib/payment-link.ts); payment happens on the sender's provider,
              never on this origin. */}
          {shared.paymentLinkUrl && (
            <a
              href={shared.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-paid px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {s.payNow} ↗
            </a>
          )}
          <PrintButton label={s.exportPdf} />
        </div>
      </div>

      <div className="print-root mx-auto w-full max-w-[820px]">
        <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200 dark:ring-neutral-800">
          <InvoiceDocument invoice={shared.document} />
        </div>
      </div>
    </div>
  );
}
