# Rookbox product

The Rookbox marketing site and dashboard. This folder is its own pnpm + Turborepo workspace,
separate from the Rust SPACE workspace around it.

| Path | What it is |
| --- | --- |
| `apps/www` | Marketing site: Astro, React islands, Tailwind v4, sitemap. English, Brazilian Portuguese (`/pt/`) and Spanish (`/es/`). |
| `apps/web` | Dashboard: Vite, React, React Router, TanStack Query, shadcn/ui on Base UI, Tailwind v4, Lingui (en, pt-BR, es). |
| `apps/api` | The product API: Hono, oRPC, Prisma + Postgres, better-auth. Runs machines on SPACE through its E2B-compatible API. See `DEPLOY.md` and `apps/api/.env.example`. |
| `packages/contracts` | The dashboard's oRPC contract (machines, API keys) and the machine lifecycle rules. |
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
  chooses the client: with `VITE_API_URL` set the dashboard talks to the real API in `apps/api`
  (and shows a sign-in screen); without it, it runs on this fake, with no sign-in. Fake machines
  run no commands and have no desktop.
- **Sample data.** The fake starts with three made-up machines and one key. The Usage page
  shows no numbers: machine hours and billing are not measured yet.

## Run the real API locally

Needs a Postgres and a SPACE (or any ECW-compatible endpoint). Copy `apps/api/.env.example` to
`apps/api/.env`, fill it in, then:

```bash
pnpm --filter @rookbox/api dev                     # http://127.0.0.1:3000, runs migrations first
VITE_API_URL=http://127.0.0.1:3000 pnpm --filter @rookbox/web dev
```

Set `ROOKBOX_SEED_OWNER_PASSWORD` once to create the owner account. `DEPLOY.md` covers the
deployment and what is not done yet (Rookbox API keys are not E2B keys).
- **Placeholders:** the dashboard's `box.example.com` default domain, the `ROOKBOX_API_KEY`
  variable name, and the dashboard's workspace, plan, limits, credits, region and snapshot-size
  values. Sidebar entries without a screen (Snapshots, Secrets, Webhooks, CI, Members) are marked
  "Soon" and are not links. The landing has no placeholders: no prices are published yet, so it
  says so.
- **The logo.** The flat monochrome "Gate" glyph and the "Rookbox" wordmark live in
  `apps/www/src/components/Logo.astro` and `apps/www/public/favicon.svg`; the social image is
  `apps/www/public/og.png`. The dashboard's `apps/web/src/components/Logo.tsx` and
  `apps/web/public/favicon.svg` use the same glyph.

## Design

Follows Rook's `DESIGN.md`: monochrome ink and paper, one green (the dark theme's primary),
Instrument Sans, hairline borders, no gradients or glow. The dashboard follows the system theme
and has a toggle in the top bar; the landing is light.
Components use semantic tokens only.

## Origin and licences

`packages/ui-tokens` and `packages/ui-web` are copied from the Rook monorepo (same owner,
Apache-2.0). The components in `packages/ui-web/src/components/ui` come from the official
shadcn/ui registry (MIT). Instrument Sans is bundled locally in each app under
`public/fonts/` with its SIL Open Font License (`instrument-sans-OFL.txt`); no font, icon or
script is loaded from a third-party host.
