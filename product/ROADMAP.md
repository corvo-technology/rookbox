# Roadmap ideas

Ideas we decided not to build for the beta. They are not promises and have no dates. Each one says what it would take and why it waits.

## CI runners (`runs-on: rookbox`)

Replace GitHub-hosted runners with Rookbox machines, so a team changes one line in a workflow:

```yaml
jobs:
  test:
    runs-on: rookbox-medium
```

What exists today: the dashboard's `/ci` page shows the other approach, where a job asks Rookbox for a machine through the E2B SDK (or the `rookbox` CLI) and the job itself still runs on a GitHub runner.

What the runner approach needs:

1. A GitHub App that listens for `workflow_job` events (queued, completed).
2. A service that creates one machine per job from a template with the GitHub Actions runner installed, registers it as an ephemeral runner (GitHub's just-in-time runner API), and deletes it when the job ends.
3. Labels that map to machine sizes (for example `rookbox-small`, `rookbox-medium`, `rookbox-large`).
4. Limits and a queue. A test matrix starts many jobs at once, so a job that finds no free machine should wait and retry instead of failing. Today the API answers 429 at the per-account limit and has no queue on purpose.
5. Security rules for public repositories and forks, and a clear statement of which secrets reach the job (only GitHub Actions secrets).
6. Enough server capacity, and billing, because CI minutes are a different workload from agent machines.

Why it waits: the beta is about agents, the server is small, billing is not enabled, and the work is a product of its own.

## Queue for machine creation

When an account is at its machine limit, creating another machine fails with 429. A queue (or `Retry-After` plus a `--wait` flag in the CLI) only helps when slots free up on their own, so it belongs together with CI runners. Until then, raise the limit for an account that needs more.

## Billing

Usage is measured per user and per customer; charging is not enabled. Planned: per-second billing in BRL, paid with Pix. Open questions: which legal entity bills and issues the nota fiscal, how IOF is described, which support channel and hours to promise, and whether prices are published.

## Dashboard items hidden for the beta

Snapshots, secrets, webhooks and members have no backend yet. They are hidden from the navigation (`SHOW_COMING_SOON` in `AppShell.tsx` brings them back).

## CLI

`rookbox usage` is missing because usage needs a dashboard session, not an API key. A key-scoped usage endpoint would unlock it. Other ideas: shell completion, Windows support, signed macOS binaries.
