# Contributing

1. Branch off `main` (`git switch -c type/short-name origin/main`). Do not commit to `main` directly.
2. Keep each pull request focused. Fill in the pull request template (What / Why / How tested).
3. Before opening the pull request, run the checks from `product/`:

   ```sh
   cd product
   pnpm install --frozen-lockfile
   pnpm lint check test build
   ```

   The `Product CI` workflow runs the same commands.
4. Never commit secrets. Never commit a `.env` file; use `.env.example` for documented variables.
   Install the pre-commit hook (`pre-commit install`) so `gitleaks` scans every commit.
5. Advance your branch with `git pull --ff-only` or a rebase. Do not use `git merge`.
