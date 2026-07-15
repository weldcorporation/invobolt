# v0.2 — Workspace mode (design)

> Status: **proposed** · Target: v0.2 · Owner: TBD
>
> This is a design proposal, not shipped code. It scopes the work on the
> [roadmap](../README.md#roadmap): *magic-link auth + Neon Postgres, status
> tracking, saved clients, shareable invoice page.* Nothing here changes how
> instant mode behaves.

## The one non-negotiable

**Instant mode stays strictly local and login-free.** The homepage `/` must keep
sending nothing over the network — no auth cookie, no analytics, no database.
Workspace mode is a *separate, opt-in surface* a user reaches only by choosing to
sign in. If we can't add it without weakening that promise, we don't add it.

Concretely:

- `/` remains a statically-rendered client page (as it is today) with zero
  server data dependencies.
- All workspace features live under a distinct route segment (`/app/**`) that is
  the only place a session cookie is read or a DB query runs.
- The privacy note on `/` stays true verbatim.

## Goals / non-goals

**Goals**
- Optional accounts via passwordless magic link (no passwords, ever).
- Persist invoices server-side so they survive across devices.
- Track invoice **status** (draft → sent → paid / overdue).
- Save **clients** so they can be reused across invoices.
- A **shareable, read-only invoice page** at a public URL for the recipient.

**Non-goals (deferred to v0.3+)**
- Payments / "Pay now" links, Stripe import, recurring invoices, email delivery
  of the invoice itself. (Magic-link email is the *only* email v0.2 sends.)
- Teams / multi-user organisations. v0.2 is single-user accounts.
- Real-time collaboration.

## Architecture: two surfaces, one core

```
                 shared, pure, no I/O
        ┌───────────────────────────────────┐
        │  src/lib/{types,calc,currency,…}   │
        │  src/components/InvoiceDocument…   │
        └───────────────┬───────────────────┘
                        │ same Invoice object
         ┌──────────────┴───────────────┐
         ▼                              ▼
  /  (instant mode)            /app/**  (workspace mode)
  client-only, localStorage    server components + route handlers
  NOTHING leaves the browser   Auth.js session + Drizzle/Neon
```

The `Invoice` model is already plain JSON with no methods (see
[`architecture.md`](./architecture.md)), so a stored invoice is *the same object*
instant mode builds — we persist it, we don't reshape it. `computeTotals` and the
templates are reused unchanged on both surfaces.

## Data model (Drizzle + Neon Postgres)

Money and structure already live in `Invoice`/`LineItem`/`Party`
([`types.ts`](../src/lib/types.ts)). Rather than fully normalise every field, we
store the invoice document as JSON and lift out only the columns we query or index
on (owner, status, dates, number). This keeps parity with instant mode and lets
the templates render a row with no translation layer.

```
users
  id            uuid  pk
  email         text  unique not null
  created_at    timestamptz not null default now()

-- Auth.js adapter tables (accounts, sessions, verification_tokens) live
-- alongside; schema comes from @auth/drizzle-adapter.

clients                       -- the "saved clients" feature
  id            uuid  pk
  user_id       uuid  fk -> users.id  not null
  party         jsonb not null        -- a Party object
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

invoices
  id            uuid  pk
  user_id       uuid  fk -> users.id  not null
  number        text  not null        -- unique per user (see below)
  status        text  not null default 'draft'
                    -- 'draft' | 'sent' | 'paid' | 'void'
                    -- 'overdue' is DERIVED (status='sent' && due_date < today),
                    -- never stored, so a date rollover can't leave it stale.
  issue_date    date  not null
  due_date      date
  currency      text  not null
  total_cents   integer not null      -- denormalised from computeTotals for
                                       -- list views / sorting; source of truth
                                       -- remains the document + calc.ts.
  document      jsonb not null        -- the full Invoice object
  share_token   text  unique          -- null until the user shares it
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

  unique (user_id, number)
```

Notes:
- `total_cents` is a cache for list/sort; it's recomputed from `document` via the
  existing `computeTotals` on every write, never hand-edited.
- `overdue` is derived, not stored — matches how the UI already thinks about it.
- All rows are owner-scoped; **every query filters by `user_id`** (see Security).

## Auth: magic link (Auth.js)

- **Auth.js v5** (`next-auth`) with the **Drizzle adapter** and the **Email
  (magic-link) provider** only. No OAuth, no credentials/passwords in v0.2.
- Email transport is the same one v0.3 will reuse (Resend). `AUTH_SECRET`,
  `AUTH_URL`, `EMAIL_FROM`, `RESEND_API_KEY` are already stubbed in
  [`.env.example`](../.env.example).
- Session strategy: database sessions (the adapter is already there), httpOnly
  secure cookie, scoped so it is **never read on `/`**.
- Middleware guards `/app/**` only. The matcher explicitly excludes `/`, static
  assets, and the public share route so instant mode never touches auth.

## Routing & rendering

| Route | Rendering | Auth | Notes |
| --- | --- | --- | --- |
| `/` | static, client | none | instant mode, unchanged |
| `/app` | server | required | invoice list + status |
| `/app/invoices/[id]` | server + client editor | required | edit, reusing `InvoiceForm` |
| `/app/clients` | server | required | saved clients CRUD |
| `/i/[shareToken]` | server, cached | none (token = capability) | read-only public invoice |
| `/api/auth/*` | route handler | — | Auth.js |

The editor on `/app/invoices/[id]` reuses `InvoiceForm` + `InvoiceDocument`
verbatim; the only new glue is load-from-DB and save-to-DB (debounced autosave)
instead of load/save-to-localStorage.

## Feature notes

**Status tracking.** A small state machine: `draft → sent → paid`, plus `void`.
`overdue` is a derived view of `sent` past `due_date`. The list view groups by
status and reuses the existing status colours (`paid`, `overdue` tokens already
exist in the Tailwind theme).

**Saved clients.** A `Party` picker in the form that reads from `clients`.
Selecting one fills `invoice.client`; a "save this client" action upserts. Purely
additive to the existing form.

**Shareable invoice page.** "Share" mints a random `share_token` and exposes
`/i/[token]` — a server-rendered, read-only `InvoiceDocument` with no app chrome
and the same print stylesheet, so the recipient can view and print-to-PDF exactly
what the sender sees. The token is an unguessable capability (revocable by nulling
it); no recipient account required. `noindex` on the page.

## Migration from instant mode

The localStorage `BusinessProfile` (schema `invobolt.profile.v1`, see
[`storage.ts`](../src/lib/storage.ts)) is the natural on-ramp. On first sign-in we
offer a one-time **"import your saved profile"** step that seeds the seller
defaults server-side. Instant-mode users lose nothing and start workspace mode
pre-filled. The local profile is never uploaded automatically — the user clicks to
import it.

## Environment / infra

- `DATABASE_URL` (Neon), `AUTH_SECRET`, `AUTH_URL`, `EMAIL_FROM`, `RESEND_API_KEY`
  — all already documented as "planned" in `.env.example`; v0.2 flips them from
  placeholder to read.
- **Feature flag:** `WORKSPACE_ENABLED`. When unset (the default, and the
  self-host default), `/app/**` and `/i/**` are not mounted and the app is byte-for-byte
  today's instant-mode-only build. This keeps "instant mode with zero env vars"
  literally true and lets us ship the plumbing incrementally behind a flag.
- Drizzle migrations in `drizzle/`, run via a new `db:migrate` script. CI gains a
  step that checks migrations are in sync with the schema.

## Security & privacy

- **Tenant isolation:** every DB access is scoped by the session `user_id`; no
  endpoint accepts a raw `id` without the ownership filter. Add a test-level
  helper so this can't regress silently.
- **Share tokens** are high-entropy random (≥128 bits), capability-style,
  revocable, and the share route is `noindex` + rate-limited.
- **No secrets in the document JSON.** `logoDataUrl` can be large; cap its size on
  write (already a data URL, kept small in instant mode).
- Magic-link tokens are single-use and short-TTL (Auth.js defaults).
- The `/` promise is protected by an automated check (see below), not just
  discipline.

## Delivery plan (incremental PRs)

Each step is independently shippable behind `WORKSPACE_ENABLED=false`:

1. **DB foundation** — Drizzle + Neon wiring, schema, migrations, `db:migrate`,
   CI migration check. No UI.
2. **Auth** — Auth.js magic-link, adapter tables, `/app` shell gated by
   middleware, sign-in/out. Bare authenticated page.
3. **Invoice persistence** — list + editor on `/app`, autosave, reuse of
   `InvoiceForm`/`InvoiceDocument`, `total_cents` via `computeTotals`.
4. **Status tracking** — status column + transitions + derived overdue in the list.
5. **Saved clients** — `clients` CRUD + form picker.
6. **Shareable page** — `share_token` + `/i/[token]` read-only route.
7. **Profile import** — one-time localStorage → account seeding.

## Resolved decisions

1. **Route prefix → `/app` (path-based), single origin.** A subdomain isolates
   cookies marginally better but complicates self-hosting and deployment config; a
   single origin with a middleware matcher that runs auth *only* under `/app`
   keeps self-host trivial and never touches `/`. The session cookie is httpOnly,
   `SameSite=Lax`, and path-scoped so it is not attached on `/`.
2. **Invoice numbering → auto-increment per user, editable.** On new-invoice we
   pre-fill the next sequential, year-scoped number (matching the sample's
   `2026-001` shape); the field stays editable and per-user uniqueness
   (`unique (user_id, number)`) is enforced on save.
3. **Autosave, debounced, with a Saving/Saved indicator.** Opening the editor
   creates (or loads) a persisted `draft` row; edits autosave on a short debounce.
   No explicit save button in the workspace editor.
4. **Neon** is the documented default (hosted serverless Postgres via the Neon
   driver). The schema is standard Postgres, so self-hosters can point
   `DATABASE_URL` at any Postgres instance.

## What this preserves

- Instant mode: unchanged, local-first, zero env vars, zero network.
- The `Invoice` model, `calc.ts`, and the templates: reused as-is on both surfaces.
- The "no login" promise: enforced by routing separation + a feature flag + a test,
  not by convention alone.
