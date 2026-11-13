# Rook Box product

The Rook Box marketing site and dashboard. This folder is its own pnpm + Turborepo workspace,
separate from the Rust SPACE workspace around it.

| Path | What it is |
| --- | --- |
| `apps/www` | Marketing site: Astro, React islands, Tailwind v4, sitemap. English, Brazilian Portuguese (`/pt/`) and Spanish (`/es/`). |
| `apps/web` | Dashboard: Vite, React, React Router, TanStack Query, shadcn/ui on Base UI, Tailwind v4, Lingui (en, pt-BR, es). |
| `packages/contracts` | The dashboard's oRPC contract (machines, API keys, usage) and the machine lifecycle rules. |
| `packages/ui-tokens` | Semantic colour tokens; `src/index.ts` generates `src/tokens.css`. |
| `packages/ui-web` | Vendored shadcn/ui components on Base UI, plus the shared theme CSS. |

## Run

Requires Node 22.12 or later and pnpm 9 (`corepack enable` or `npm i -g pnpm@9`).

```bash
cd product
pnpm install
pnpm --filter @rookbox/www dev   # http://127.0.0.1:4321
pnpm --filter @rookbox/web dev   # http://127.0.0.1:5173
```

`pnpm dev` starts both through Turborepo. Other commands, from `product/`:

```bash
pnpm build      # turbo build: both apps
pnpm check      # turbo check: tsc for packages and the dashboard, astro check for the site
pnpm lint       # Biome
pnpm test       # Vitest: contracts, tokens, fake API, dashboard helpers
pnpm --filter @rookbox/web intl:extract   # refresh the Lingui catalogs after changing copy
```

The site's "Get started" and "Dashboard" links go to `PUBLIC_DASHBOARD_URL`, which defaults to
the local dashboard.

### Screenshots

Build both apps, serve them (`pnpm --filter @rookbox/www preview` and
`pnpm --filter @rookbox/web preview`), then run `pnpm screenshots`. It drives the locally
installed Google Chrome through Playwright and writes PNGs to `.screenshots/` (ignored by git).

## What is faked

- **The API.** `apps/web/src/lib/fake-api.ts` implements the contract in memory with oRPC's
  server router, so inputs and outputs are validated exactly as a real server would validate
  them. Calls answer after a simulated 180 to 520 ms, and machines move through the lifecycle on
  their own (`creating` to `running`, `suspending` to `suspended`, `restoring` to `running`,
  `deleting` to gone). State resets on reload. `apps/web/src/lib/api.ts` is the only place that
  chooses the client: swap it for `createORPCClient(new RPCLink(...))` once the Hono/oRPC API
  exists.
- **Sample data.** The dashboard starts with three made-up machines and one key. Usage numbers
  are generated per day and the page labels them "Sample data".
- **No auth, no database, no backend server** in this round.
- **Placeholders:** the domain `box.example.com` (SDK snippets, site URL, sitemap), the
  `ROOKBOX_API_KEY` variable name, and the Docs, Pricing, Changelog, About, Privacy and Terms
  links (anchors until those pages exist). The `desktop` template is shown as coming soon and
  cannot be selected; "Open desktop" is disabled.

## Design

Follows Rook's `DESIGN.md`: monochrome ink and paper, one green (the dark theme's primary),
Instrument Sans, hairline borders, no gradients or glow, light and dark following the system.
Components use semantic tokens only.

## Origin and licences

`packages/ui-tokens` and `packages/ui-web` are copied from the Rook monorepo (same owner,
Apache-2.0). The components in `packages/ui-web/src/components/ui` come from the official
shadcn/ui registry (MIT). Instrument Sans is bundled locally in each app under
`public/fonts/` with its SIL Open Font License (`instrument-sans-OFL.txt`); no font, icon or
script is loaded from a third-party host.
