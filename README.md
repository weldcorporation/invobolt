<div align="center">

# ⚡ Invobolt

**Invoices in a bolt.** · *Facturen in een flits.*

Free, open-source invoice generator — create and export a professional invoice
in seconds. No login, no signup, private by default.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-F5A524.svg)](./LICENSE)

</div>

---

## What is this?

Freelancers and small businesses just need to send the occasional invoice, but
every tool wants a signup, a subscription, or a full accounting suite. Invobolt
gives away the fastest possible invoice generator instead:

- **Value before signup** — fill a form, watch the live preview, export a PDF. No account, ever.
- **Local-first & private** — in instant mode nothing leaves your browser.
- **EU-friendly by default** — first-class VAT (multiple rates, reverse charge), multi-currency, EN/NL.
- **Open & forkable** — AGPL-3.0, a boring familiar stack, clean contribution surfaces.

This repository contains the **instant-mode generator** (v0.1) and the optional
**workspace mode** (v0.2): sign in with a magic link to keep invoices across
devices, track their status, save clients, and hand out a read-only invoice
link. v0.3 adds **payments & delivery** on top: email an invoice to its
recipient, put a "Pay now" link on it, import customers and products from
Stripe, and generate recurring invoices on a schedule.

## Features

### Instant mode (no account, nothing leaves your browser)

- ✍️ Invoice form with live, WYSIWYG preview
- 🧾 Three templates — **Modern**, **Classic**, **Minimal** — with tabular figures
- 🇪🇺 VAT handling: standard (multi-rate), **reverse charge** (EU B2B), and exempt
- 💱 Multi-currency with locale-aware formatting (`Intl.NumberFormat`)
- 🌍 EN / NL invoice + UI language
- 🎨 Accent colour + optional logo (kept local as a data URL)
- 💾 Business-profile memory in `localStorage` — remembered only on your device
- 🖨️ PDF export via the browser's native print-to-PDF (vector text, perfect fidelity)

### Workspace mode (optional, off by default when self-hosting)

- 🔑 Passwordless sign-in via magic link (Neon Auth) — no passwords, ever
- ☁️ Invoices persisted server-side, with debounced autosave
- 📊 Status tracking: draft → sent → paid (+ void), overdue derived from the due date
- 👥 Saved clients, reusable across invoices
- 🔗 Shareable read-only invoice page at an unguessable, revocable URL
- 📥 One-click import of your local business profile on first sign-in
- ✉️ Email the invoice to your client (Resend) — a revocable link, not an attachment
- 💳 "Pay now" button on the shared page and in the email — paste any https payment link
- 🔁 Recurring invoices: schedules that generate fresh drafts on cadence, optionally auto-sent
- 🧲 Stripe import: customers → saved clients, products → reusable line items (paste a read-only key; it is never stored)

Workspace mode mounts only when `WORKSPACE_ENABLED=true` (see
[`.env.example`](./.env.example)); without it the app is exactly the
instant-mode build, and `/` never reads a cookie or touches a database either way.
Two of the v0.3 features want configuration of their own on top: email needs
`EMAIL_FROM` and `RESEND_API_KEY` (without them, no Send button), and recurring
generation needs `CRON_SECRET` (without it, no cron endpoint). "Pay now" links
need nothing — the sender pastes a URL — and Stripe import asks for a key per
import rather than reading one from the environment.

## Quick start

```bash
pnpm install
pnpm run dev
# open http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Start the dev server |
| `pnpm run build` | Production build |
| `pnpm run start` | Serve the production build |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript, no emit |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm run test:watch` | Vitest in watch mode |
| `pnpm run db:generate` | Regenerate Drizzle migrations after a schema change |
| `pnpm run db:migrate` | Apply migrations to `DATABASE_URL` (workspace mode) |

## How PDF export works

Instant mode never sends your data anywhere, so we export using the browser's
own **Print → Save as PDF**. A dedicated print stylesheet (`src/app/globals.css`)
isolates the invoice sheet (A4, no margins) and hides the app chrome. The result
is a crisp, selectable-text PDF that matches the preview exactly — with zero
extra dependencies.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** for styling
- Local-first: `localStorage` today (IndexedDB / installable PWA planned)
- Hosted on **Vercel**; self-hostable

Workspace mode adds **Neon** serverless Postgres (via Drizzle) and **Neon Auth**
(Managed Better Auth) — both are used only when `WORKSPACE_ENABLED` is true, so
instant mode still runs with zero env vars.

## Project structure

```text
src/
├─ app/
│  ├─ layout.tsx        # document shell + metadata
│  ├─ page.tsx          # instant mode: the generator (state owner)
│  ├─ globals.css       # styles + print stylesheet
│  ├─ app/              # workspace mode: invoices, clients, recurring, import
│  ├─ auth/             # magic-link sign-in + callback
│  ├─ i/[token]/        # public read-only shared invoice (+ Pay now)
│  ├─ api/auth/         # Neon Auth proxy route
│  └─ api/cron/         # recurring-invoice generation (CRON_SECRET-gated)
├─ components/
│  ├─ InvoiceForm.tsx   # the editing surface (both modes)
│  ├─ InvoiceDocument.tsx  # the 3 printable templates (both modes)
│  └─ ui.tsx            # small form primitives
├─ lib/
│  ├─ types.ts          # Invoice / Party / LineItem
│  ├─ calc.ts           # subtotal, discount, per-rate VAT, total
│  ├─ currency.ts       # currency list + Intl formatting
│  ├─ format.ts         # locale-aware dates
│  ├─ i18n.ts           # EN / NL dictionaries
│  ├─ sample.ts         # starter invoice
│  ├─ storage.ts        # local business-profile persistence
│  ├─ db/               # Drizzle schema + Neon client (workspace)
│  └─ …                 # workspace data access (invoices, clients, status, …)
└─ proxy.ts             # redirects signed-out /app/** navigations to sign-in
```

See [`docs/architecture.md`](./docs/architecture.md) for a deeper tour, including
how to add a template, a locale, or a currency.

## Roadmap

- **v0.1** ✅ — instant-mode generator, live preview, VAT + multi-currency, PDF export, 3 templates, business-profile memory.
- **v0.2** ✅ — workspace mode (magic link + Neon), status tracking, saved clients, shareable invoice page. → [design & as-built notes](./docs/workspace-mode-design.md)
- **v0.3** ✅ — email delivery, "Pay now" links, Stripe import (customers/products), recurring invoices. → [design & as-built notes](./docs/v0.3-design.md)
- **v0.4** — Stripe webhooks (auto-mark paid), payment-link generation.
- **v1.0** — polished templates, more locales, self-host Docker image.

## Contributing

Contributions are very welcome — especially new **templates**, **locales**, and
**tax rules**. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) and please be
kind: this project follows a [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[GNU AGPL-3.0](./LICENSE). You're free to use, study, share, and improve
Invobolt; if you run a modified version as a network service, you must share your
changes under the same license. This keeps the project open and discourages
closed-source clones.
