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

This repository is the **v0.1 instant-mode generator**. Workspace mode, Stripe
import, and recurring invoices are on the [roadmap](#roadmap).

## Features (v0.1)

- ✍️ Invoice form with live, WYSIWYG preview
- 🧾 Three templates — **Modern**, **Classic**, **Minimal** — with tabular figures
- 🇪🇺 VAT handling: standard (multi-rate), **reverse charge** (EU B2B), and exempt
- 💱 Multi-currency with locale-aware formatting (`Intl.NumberFormat`)
- 🌍 EN / NL invoice + UI language
- 🎨 Accent colour + optional logo (kept local as a data URL)
- 💾 Business-profile memory in `localStorage` — remembered only on your device
- 🖨️ PDF export via the browser's native print-to-PDF (vector text, perfect fidelity)

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Run the unit tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |

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

Later tiers add **Neon** serverless Postgres (via Drizzle) and **Neon Auth**
(Managed Better Auth) for the optional workspace mode — see the roadmap.

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx        # document shell + metadata
│  ├─ page.tsx          # the generator (state owner)
│  └─ globals.css       # styles + print stylesheet
├─ components/
│  ├─ InvoiceForm.tsx   # the editing surface
│  ├─ InvoiceDocument.tsx  # the 3 printable templates
│  └─ ui.tsx            # small form primitives
└─ lib/
   ├─ types.ts          # Invoice / Party / LineItem
   ├─ calc.ts           # subtotal, discount, per-rate VAT, total
   ├─ currency.ts       # currency list + Intl formatting
   ├─ format.ts         # locale-aware dates
   ├─ i18n.ts           # EN / NL dictionaries
   ├─ sample.ts         # starter invoice
   └─ storage.ts        # local business-profile persistence
```

See [`docs/architecture.md`](./docs/architecture.md) for a deeper tour, including
how to add a template, a locale, or a currency.

## Roadmap

- **v0.1** *(this repo)* — instant-mode generator, live preview, VAT + multi-currency, PDF export, 3 templates, business-profile memory.
- **v0.2** — workspace mode (magic link + Neon), status tracking, saved clients, shareable invoice page. → [design proposal](./docs/workspace-mode-design.md)
- **v0.3** — Stripe import (customers/products) + "Pay now" links, recurring invoices, email delivery.
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
