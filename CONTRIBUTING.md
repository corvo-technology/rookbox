# Contributing

Thanks for helping. This repository holds the Rookbox product (`product/`) and the sandbox engine
that runs the machines (Rust, at the root). See [README.md](README.md) for the map.

## Workflow

1. Branch off `main`: `git switch -c type/short-name origin/main`. Never commit to `main` directly.
2. Keep each pull request focused and fill in the pull request template (What / Why / How tested).
3. Advance your branch with `git pull --ff-only` or a rebase. Do not use `git merge`.
4. CODEOWNERS approval is required to merge into `main`.

## Product changes (`product/`)

```sh
cd product
pnpm install --frozen-lockfile
pnpm lint check test build
pnpm format                      # fixes style
```

The `Product CI` workflow runs the same commands on every pull request that touches `product/`.
Do not change environment variable names or API identifiers casually: production reads them (see
`product/DEPLOY.md`). Update `DEPLOY.md` when a deploy step or variable changes.

## Engine changes

The engine's build and test commands live in its own documentation: start with
`docs/development-overview.md` and `docs/architecture.md`. The `Product CI` workflow does not
build the engine, so run its checks locally and say which ones in "How tested".

## Secrets

Never commit secrets or a `.env` file; document variables in `.env.example`. Install the hook with
`pre-commit install` so gitleaks scans each commit. Use synthetic data in tests and examples, and
keep customer data, raw logs and private endpoints out of issues, commits and pull requests.

## Security issues

Report them privately, as described in [SECURITY.md](SECURITY.md), not in a public issue or pull
request.
