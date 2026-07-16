# Contributing to Invobolt

Thanks for helping make invoicing fast and free! This guide covers how to get
set up and the highest-leverage places to contribute.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting set up

```bash
git clone https://github.com/weldcorporation/invobolt.git
cd invobolt
pnpm install
pnpm run dev
```

Before opening a pull request, make sure the checks pass:

```bash
ppnpm run lint
pnpm run typecheck
pnpm run build
```

## Ground rules

- **Keep instant mode local-first.** The core generator must work with no
  account and send nothing over the network. Anything that needs a server
  belongs in workspace mode (v0.2+) and must be optional.
- **The user's invoice is the hero.** Templates stay restrained — don't
  over-brand exports.
- **Small, focused PRs** are easier to review and land faster.
- Match the surrounding code style; `ppnpm run lint` is the source of truth.

## Great first contributions

### Add a template

1. Add a new template component in `src/components/InvoiceDocument.tsx`
   (follow `ModernTemplate` / `ClassicTemplate` / `MinimalTemplate`).
2. Add its id to the `TemplateId` union in `src/lib/types.ts`.
3. Register it in the `TEMPLATES` list in `src/components/InvoiceForm.tsx` and
   the dispatcher `switch` in `InvoiceDocument.tsx`.

Use the `.tnum` class on every monetary value so amounts align to the cent.

### Add a locale

1. Add a `Dict` and a `UIStrings` object in `src/lib/i18n.ts`.
2. Add the locale code to the `Locale` union in `src/lib/types.ts`.
3. Wire it into the `DICTS` / `UI` maps and the language `<select>` in
   `InvoiceForm.tsx`.

Everything user-visible flows through `i18n.ts` — no hard-coded strings in
components.

### Add a currency

Append an entry to `CURRENCIES` in `src/lib/currency.ts`. Formatting is handled
automatically by `Intl.NumberFormat`.

### Improve tax rules

VAT logic lives in `src/lib/calc.ts` (`computeTotals`, `effectiveRate`). New
rules (e.g. per-country validation, small-business schemes) should be pure
functions with no UI coupling, so they're easy to test and reuse.

## Reporting bugs & ideas

Open an issue with steps to reproduce (for bugs) or the problem you're trying to
solve (for features). Screenshots of the invoice preview help a lot.

## License

By contributing, you agree that your contributions will be licensed under the
project's [AGPL-3.0](./LICENSE) license.
