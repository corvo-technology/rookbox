# Rookbox CLI

The `rookbox` command: create machines and use them from your terminal. It is a thin layer on the
unmodified [E2B SDK](https://www.npmjs.com/package/e2b) (`e2b`, pinned in `package.json`),
pointed at the Rookbox API. The SDK speaks the protocol; nothing here reimplements it.

## Install

```sh
curl -fsSL https://rookbox.run/install | sh
```

macOS and Linux, x86_64 and arm64. The installer downloads the binary from the latest `cli-v*`
GitHub release, checks it against the release's `SHA256SUMS`, and copies it to `~/.local/bin`
(no sudo). It runs nothing it downloads. `ROOKBOX_VERSION=0.1.0` picks a version and
`ROOKBOX_INSTALL_DIR` picks the directory. It tells you if the directory is not in your `PATH`.

## Start

```sh
rookbox login        # asks for your API key (hidden), checks it, saves it
rookbox new          # creates a machine and prints its id
rookbox shell <id>   # a terminal inside it; Ctrl-D leaves
```

Make an API key in the dashboard. The key is saved in `~/.config/rookbox/config.json` (mode 0600).
`ROOKBOX_API_KEY` or `E2B_API_KEY` in the environment wins over the saved one, and `login --key`
skips the prompt (a key piped to stdin works too).

## Commands

| Command | What it does |
| --- | --- |
| `login [--key k]`, `logout`, `whoami` | Save, forget and show the key in use |
| `new [--name n] [--timeout 30m] [--json]` | Create a machine. `--timeout` is the idle time before it pauses (1m to 24h) |
| `ls [--json]` | List machines |
| `run <id> -- <command...>` | Run a command, streaming stdout and stderr; exits with its exit code |
| `shell <id>` | Interactive terminal (raw mode, resize) |
| `pause <id>`, `resume <id>` | Pause keeps memory and disk; resume brings it back |
| `kill <id> [-y]` | Delete a machine (asks unless `-y`) |
| `url <id> <port>` | The public `https` URL for a port of a running machine |
| `desktop <id>` | Open the machine in the dashboard (prints the URL if no browser opens) |
| `update` | Check for a newer release and show the install command |
| `version` | Print the version |

`rookbox --help` and `rookbox <command> --help` say more. With several words after `--`, `run`
quotes each for the machine's shell; with one, it is taken as a whole command line
(`rookbox run <id> -- "make test && make lint"`).

Messages are English or Portuguese: `ROOKBOX_LANG=pt` (otherwise from `LANG`). Colors appear only on
a terminal and `NO_COLOR` turns them off.

Exit codes: `0` ok, `1` failure, `2` usage, `3` bad or missing key, `4` not found, `5` machine
limit or no capacity. `run` exits with the command's own code instead.

`ROOKBOX_API_URL` points the CLI somewhere else (default `https://api.rookbox.run`); it is also what
the SDK sees as `E2B_API_URL`. There is no `usage` command: usage needs a dashboard session, not an
API key.

## Uninstall

```sh
rm ~/.local/bin/rookbox        # or wherever ROOKBOX_INSTALL_DIR put it
rm -r ~/.config/rookbox        # the saved key
```

## Develop

```sh
cd product
pnpm install
pnpm --filter @rookbox/cli test          # unit tests, a fake API, and the installer against a fake release host
pnpm --filter @rookbox/cli dev -- ls     # run from source (tsx)
pnpm --filter @rookbox/cli build         # dist/rookbox.mjs, runs on Node 22
cd apps/cli && node scripts/build.mjs --binary   # dist/rookbox-<os>-<arch>, needs Bun
```

Layout: `src/cli.ts` is every command, written against the small `Api` interface in `src/sdk.ts`,
the only file that imports `e2b`. Tests drive the real SDK against a local fake of the Rookbox API
(`src/cli.test.ts`) and use a stand-in `Api` where a machine would be needed (`run`, `kill`, `url`).
The installer lives in `../www/public/install` and is tested by `scripts/install.test.ts`.

### Why `bun build --compile`

Both options give one file with no runtime to install. Bun was picked because:

- It compiles the esbuild bundle of the CLI and the E2B SDK as is. The host binary was built and
  run against a local fake of the Rookbox API (login, list, error mapping); the unit tests run the
  same SDK calls on Node.
- It cross-targets and needs one command (`bun build --compile --target=bun-<os>-<arch>`).
  Node's single executable applications (SEA) need the bundle as one CommonJS script, a blob
  generated with the exact Node version, a copy of the `node` binary, `postject` to inject the
  blob, and a re-signing step on macOS: more moving parts per platform for the same result.
- The binary is about 60 MB (it embeds the runtime).

The cost: the runtime inside the binary is Bun, not Node, so a bug that shows only on Bun is
possible. The release workflow runs `--help` and `version` on each platform's binary, and the unit
tests run on Node, so a difference in the SDK's behavior on Bun, in `pty` above all, would show up only in real use.
