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
  NOTHING leaves the browser   Neon Auth session + Drizzle/Neon
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

Users are **not** an app-owned table: authentication is handled by Neon Auth (see
below), which manages user records in the Neon-managed `neon_auth` schema. Our
tables key off the Neon Auth user id (a string) and join to `neon_auth.users_sync`
only for display.

```
-- Users live in Neon Auth's managed `neon_auth` schema (neon_auth.users_sync),
-- created and synced by Neon — NOT migrated by this app.

profiles                      -- added in step 7: the seller defaults new
  user_id       text  pk         -- invoices are pre-filled from. One per user,
  profile       jsonb not null   -- so user_id is the key, not an indexed column.
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

clients                       -- the "saved clients" feature
  id            uuid  pk
  user_id       text  not null        -- Neon Auth user id (no hard cross-schema FK)
  name          text  not null        -- lifted from party: what we sort on
  name_key      text  not null        -- lower(name): what we dedupe on
  party         jsonb not null        -- a Party object
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

  unique (user_id, name_key)

invoices
  id            uuid  pk
  user_id       text  not null        -- Neon Auth user id (no hard cross-schema FK)
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
- `clients.name`/`name_key` were **added during step 5** — this section
  originally lifted nothing out of `party`. "Save this client" has to be an
  upsert, which needs a key: without a unique index, saving Acme twice silently
  accrues duplicate Acmes, and deduping in app code is a read-then-write race.
  Lifting the field we index on is the same principle the invoice columns
  follow. `name_key` is a stored column rather than a `lower(name)` index
  expression only because a plain column can be an `ON CONFLICT` target.
- `total_cents` is a cache for list/sort; it's recomputed from `document` via the
  existing `computeTotals` on every write, never hand-edited.
- `overdue` is derived, not stored — matches how the UI already thinks about it.
- All rows are owner-scoped; **every query filters by `user_id`** (see Security).
- The app migrates only `profiles`, `clients` and `invoices`; the `neon_auth`
  schema is provisioned and maintained by Neon Auth, not by our Drizzle
  migrations.

## Auth: Neon Auth (Managed Better Auth)

Authentication uses **Neon Auth**, Neon's managed auth service (powered by Better
Auth), via the [`@neondatabase/auth`](https://www.npmjs.com/package/@neondatabase/auth)
SDK. Neon Auth runs the auth server, sends magic-link emails, and syncs users into
the `neon_auth` schema of the same database — so there is no adapter, no app-owned
user/session tables, and no separate email provider to run for sign-in.

- **Server** (`@neondatabase/auth/next/server`): a single `createNeonAuth({ baseUrl,
  cookies: { secret } })` instance exposes `.handler()` (the `/api/auth/[...path]`
  route), `.middleware({ loginUrl })` (route protection), and `.getSession()` (read
  the session in a Server Component). Built **lazily** so a default build needs no
  config — `createNeonAuth` throws if the cookie secret is missing/short.
- **Client** (`@neondatabase/auth/next`): an argless `createAuthClient()` that talks
  to this app's own same-origin `/api/auth` proxy — used for `signIn.magicLink()`
  on the sign-in page and `signOut()`.
- **Config** comes from `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` (≥32
  chars), set after enabling Neon Auth on the Neon project. Which sign-in methods
  are offered (magic link, email OTP, social) is configured in the Neon dashboard.
- **Sessions** are signed cookies scoped so they are **never read on `/`**. The
  proxy (`src/proxy.ts`) guards `/app/**` only; `/auth/sign-in` sits outside that
  matcher so it is reachable without a session. Everything is flag-gated: with
  workspace mode off, `/app`, `/auth`, and `/api/auth` all 404.

Why Neon Auth over Auth.js: it removes the auth database schema we'd otherwise own
and keeps auth + data in one Neon project. The trade-off is coupling to Neon (the
SDK is currently beta) — acceptable because Neon is already the documented Postgres.

## Routing & rendering

| Route | Rendering | Auth | Notes |
| --- | --- | --- | --- |
| `/` | static, client | none | instant mode, unchanged |
| `/app` | server | required | invoice list + status |
| `/app/invoices/[id]` | server + client editor | required | edit, reusing `InvoiceForm` |
| `/app/clients` | server | required | saved clients CRUD |
| `/i/[shareToken]` | server, never cached | none (token = capability) | read-only public invoice — see Feature notes for why not cached |
| `/auth/sign-in` | client | none | magic-link sign-in (outside the proxy matcher) |
| `/api/auth/[...path]` | route handler | — | Neon Auth proxy |

The editor on `/app/invoices/[id]` reuses `InvoiceForm` + `InvoiceDocument`
verbatim; the only new glue is load-from-DB and save-to-DB (debounced autosave)
instead of load/save-to-localStorage.

## Feature notes

**Status tracking.** A small state machine: `draft → sent → paid`, plus `void`.
`overdue` is a derived view of `sent` past `due_date`. The list view groups by
status and reuses the existing status colours (`paid`, `overdue` tokens already
exist in the Tailwind theme).

As built (`lib/status.ts` owns the machine; the schema imports the type from it,
so client components get `InvoiceStatus` without pulling in Drizzle):

- Each forward edge has an undo, because the forward edge is one click and
  people mis-click: `sent → draft`, `paid → sent`, `void → draft`. `void` is
  reachable from any live status; nothing transitions to itself, and
  `draft → paid` must go through `sent`.
- Legality is enforced in the UPDATE's `WHERE` (`status IN sourcesFor(next)`)
  rather than by reading the row first, so the check is atomic — two tabs racing
  to mark one invoice paid cannot both observe `sent` and both apply.
- The status arriving at the Server Action is narrowed at runtime
  (`isInvoiceStatus`), since the type annotation is erased in the compiled
  output and the action is a public endpoint.
- `overdue` is recomputed on every read from a server-supplied `today`, never
  written. Due *today* is not yet overdue.

**Saved clients.** A `Party` picker in the form that reads from `clients`.
Selecting one fills `invoice.client`; a "save this client" action upserts. Purely
additive to the existing form.

As built:

- "Purely additive" is enforced by shape: `InvoiceForm` gained one optional
  `clientPicker?: ReactNode` slot, not a `clients` prop. Instant mode has no
  database and passes nothing, so `/` renders exactly the form it did before —
  the workspace concept is injected, never imported into the shared component.
- Two write paths, deliberately: **upsert by name** (`saveClientAction`) is
  right when saving a bill-to that may or may not already be a client, while
  **update by id** (`updateClientAction`) is what the clients page edits with —
  keying an edit by name would turn renaming Acme to Acme Ltd into a second row
  and orphan the first.
- Picking copies the saved party into the invoice. The invoice keeps its own
  snapshot, so editing a saved client never rewrites history on invoices already
  sent.
- `/app/clients` reuses `PartyFields` from the invoice form verbatim: a saved
  client is the same `Party` as a bill-to, so it gets the same editing surface.

**Shareable invoice page.** "Share" mints a random `share_token` and exposes
`/i/[token]` — a server-rendered, read-only `InvoiceDocument` with no app chrome
and the same print stylesheet, so the recipient can view and print-to-PDF exactly
what the sender sees. The token is an unguessable capability (revocable by nulling
it); no recipient account required. `noindex` on the page.

As built:

- **Not cached** — this section originally said "server, cached", and that is
  wrong for a capability URL. A cached HTML response keeps serving an invoice
  after the sender revokes the link, which breaks the one property that makes
  handing out a URL safe. The route is `force-dynamic`; the cost is one indexed
  lookup on a unique column per view. Revocation is verified to take effect on
  the next request.
- Tokens are 192 bits from `crypto.getRandomValues`, base64url. Nothing about
  them is derived from the row — an id or a hash of the invoice number would be
  predictable from information the recipient already has.
- Sharing is **idempotent**: pressing Share twice returns the existing token
  rather than rotating it, or the link already emailed to the client would
  quietly die. The `IS NULL` guard sits in the WHERE clause so concurrent
  shares can't each mint a token and leave one caller holding a dead URL.
- Unknown, malformed, and revoked tokens all 404 identically — distinguishing
  them would confirm which tokens once existed.
- `getSharedInvoice` selects only `status` and `document`: never the owner or
  the row id, so a link-holder has nothing to pivot on. It is the single
  deliberate exception to owner-scoping, and `tenant-isolation.test.ts` names it
  explicitly so it can't quietly become the pattern.

**Not implemented: rate limiting.** The Security section below asks for it and
this does not have it. A per-instance in-memory limiter is close to useless on
serverless, where requests spread across instances, and doing it properly needs
a shared store (Vercel KV / Upstash) — new infrastructure and a new env var,
which felt like more than this step should smuggle in. The exposure is small:
guessing a 192-bit token is infeasible, so a limiter here buys protection
against volumetric abuse rather than enumeration, and that is better handled at
the edge/CDN. Worth revisiting if `/i/**` ever gets an endpoint that costs more
than one indexed lookup.

## Migration from instant mode

The localStorage `BusinessProfile` (schema `invobolt.profile.v1`, see
[`storage.ts`](../src/lib/storage.ts)) is the natural on-ramp. On first sign-in we
offer a one-time **"import your saved profile"** step that seeds the seller
defaults server-side. Instant-mode users lose nothing and start workspace mode
pre-filled. The local profile is never uploaded automatically — the user clicks to
import it.

As built:

- **"Seeds the seller defaults server-side" needed somewhere to put them**, which
  the data model above never defined — so step 7 adds a `profiles` table
  (`user_id` primary key, `profile` jsonb). The key is `user_id` rather than an
  indexed column: a user has exactly one profile, so a second row should be
  unrepresentable and the upsert gets an obvious conflict target.
- `createInvoice` pre-fills new drafts through the same `applyProfile` merge
  instant mode runs against localStorage — that merge moved from `storage.ts`
  to `profile.ts` so server code can reach the rule without importing browser
  persistence. Without a profile, drafts stay blank exactly as before.
- **Nothing uploads on its own.** The banner reads localStorage into component
  state; only pressing Import sends it. Declining is a localStorage flag, not a
  column — the prompt can only appear on a device that has a local profile, so
  the answer belongs on that device, and the server learns nothing from a "no".
  Only the *existence* of a server profile crosses to the client, never its
  contents.
- The payload is narrowed (`isBusinessProfile`) and rebuilt
  (`normalizeBusinessProfile`) rather than trusted. It comes off localStorage,
  which anything on the origin can write, and lands in a jsonb column — the
  `locale`/`template` unions erase at runtime, so they're checked against real
  lists.
- **Beyond the literal step: a "Save as default" button in the editor.** Without
  it, a profile could only ever be set once, from localStorage, and never
  corrected — the feature would be a dead end for anyone who imported stale
  details or never had a local profile at all. It mirrors instant mode's "Save
  business profile" and reuses the same pure `profileFromInvoice`.

## Environment / infra

- `DATABASE_URL` (Neon), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32
  chars), and later `EMAIL_FROM`/`RESEND_API_KEY` for v0.3 invoice delivery — all
  documented in `.env.example`. Neon Auth is enabled on the Neon project; it
  provisions the `neon_auth` schema itself.
- **Feature flag:** `WORKSPACE_ENABLED`. When unset (the default, and the
  self-host default), `/app/**`, `/auth/**`, `/api/auth/**`, and `/i/**` are not
  mounted and the app is byte-for-byte today's instant-mode-only build. This keeps
  "instant mode with zero env vars" literally true and lets us ship the plumbing
  incrementally behind a flag.
- Drizzle migrations in `drizzle/`, run via a new `db:migrate` script. CI gains a
  step that checks migrations are in sync with the schema.
- **Deploys migrate themselves.** `vercel.json` points `buildCommand` at
  `pnpm run vercel-build`, which runs `scripts/predeploy-migrate.mjs` before
  `next build`, so a deployment's tables exist before it serves a request. The
  step is gated on `WORKSPACE_ENABLED` and no-ops for instant-mode builds. The
  explicit `buildCommand` is required: with the Next.js preset and a `build`
  script present, Vercel would run `build` and never reach `vercel-build`.
- **Functions run in `fra1` (Frankfurt)**, set via `regions` in `vercel.json`,
  because Neon lives in `eu-central-1`. Vercel's default is `iad1` (Washington
  DC), which would put the Atlantic between every workspace query and its
  database — twice per round trip — and process EU invoice data in the US. Both
  the latency and the data-residency story matter here (see EU-first, above), so
  compute stays next to the data. If the database ever moves, this moves with it.

## Security & privacy

- **Tenant isolation:** every DB access is scoped by the session `user_id`; no
  endpoint accepts a raw `id` without the ownership filter. Add a test-level
  helper so this can't regress silently.
- **Share tokens** are high-entropy random (≥128 bits — 192 as built),
  capability-style, revocable, and the share route is `noindex`. Rate limiting
  is **not** implemented; see the reasoning under Feature notes.
- **No secrets in the document JSON.** `logoDataUrl` can be large; cap its size on
  write (already a data URL, kept small in instant mode).
- Magic-link tokens and session lifetimes are managed by Neon Auth; sign-in
  secrets never live in this repo (only `NEON_AUTH_BASE_URL` + a cookie secret).
- The `/` promise is protected by an automated check (see below), not just
  discipline.

## Delivery plan (incremental PRs)

Each step is independently shippable behind `WORKSPACE_ENABLED=false`:

1. ✅ **DB foundation** — Drizzle + Neon wiring, schema, migrations, `db:migrate`,
   CI migration check. No UI.
2. ✅ **Auth** — Neon Auth (Managed Better Auth): server instance, `/api/auth`
   proxy, `/app` shell gated by the proxy, magic-link sign-in + sign-out. Bare
   authenticated page.
3. ✅ **Invoice persistence** — list + editor on `/app`, autosave, reuse of
   `InvoiceForm`/`InvoiceDocument`, `total_cents` via `computeTotals`.
4. ✅ **Status tracking** — status column + transitions + derived overdue in the list.
5. ✅ **Saved clients** — `clients` CRUD + form picker.
6. ✅ **Shareable page** — `share_token` + `/i/[token]` read-only route.
7. ✅ **Profile import** — one-time localStorage → account seeding.

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
