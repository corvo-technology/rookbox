import { API_URL } from "./auth";

/** Used until the API has said which domain machines live on. */
export const ROOKBOX_DOMAIN: string = import.meta.env.VITE_E2B_DOMAIN ?? "box.rookbox.run";

/** What the E2B SDK's `E2B_API_URL` is set to: the real API when the dashboard has one. */
export const E2B_API_URL: string = API_URL ?? "https://api.rookbox.run";

/** The template the examples create when the deployment has not said which it offers. */
export const DEFAULT_TEMPLATE = "seed";

/** The two variables the unmodified E2B SDKs read. `E2B_DOMAIN` is not needed. */
export function envSnippet(apiUrl: string = E2B_API_URL): string {
  return `export E2B_API_KEY=rbx_your_key_here
export E2B_API_URL=${apiUrl}`;
}

/** JavaScript: create a machine, run a command, remove it. */
export function jsSnippet(template: string = DEFAULT_TEMPLATE): string {
  return `import { Sandbox } from "e2b";

// Reads E2B_API_KEY and E2B_API_URL from the environment.
const sandbox = await Sandbox.create("${template}", { timeoutMs: 10 * 60_000 });
try {
  const result = await sandbox.commands.run("uname -a");
  console.log(result.stdout);
} finally {
  await sandbox.kill();
}`;
}

/** Python: create a machine, run a command, remove it. */
export function pythonSnippet(template: string = DEFAULT_TEMPLATE): string {
  return `from e2b import Sandbox

# Reads E2B_API_KEY and E2B_API_URL from the environment.
sandbox = Sandbox.create("${template}", timeout=10 * 60)
try:
    print(sandbox.commands.run("uname -a").stdout)
finally:
    sandbox.kill()`;
}

/** Python: connect to a machine that already exists and run a command in it. */
export function connectSnippet(machineId: string): string {
  return `from e2b import Sandbox

# Reads E2B_API_KEY and E2B_API_URL from the environment.
sandbox = Sandbox.connect("${machineId}")
print(sandbox.commands.run("uname -a").stdout)`;
}

/**
 * A GitHub Actions job that starts a machine, runs a command and always removes it. The key
 * comes from a repository secret named ROOKBOX_API_KEY.
 */
export function githubActionsSnippet(
  template: string = DEFAULT_TEMPLATE,
  apiUrl: string = E2B_API_URL,
): string {
  return `name: Run on a Rookbox machine
on: [push]

jobs:
  run:
    runs-on: ubuntu-latest
    env:
      E2B_API_KEY: \${{ secrets.ROOKBOX_API_KEY }}
      E2B_API_URL: ${apiUrl}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install e2b
      - name: Start a machine, run a command, remove it
        run: |
          cat > run.mjs <<'EOF'
          import { Sandbox } from "e2b";
          const sandbox = await Sandbox.create("${template}", { timeoutMs: 15 * 60_000 });
          try {
            const result = await sandbox.commands.run("echo hello from Rookbox");
            console.log(result.stdout);
          } finally {
            await sandbox.kill();
          }
          EOF
          node run.mjs`;
}
