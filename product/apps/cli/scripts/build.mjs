// Bundles the CLI and the E2B SDK into one file, dist/rookbox.mjs, that runs on plain Node.
//
// With `--binary` it then compiles that bundle into a self-contained executable with
// `bun build --compile`, dist/rookbox-<os>-<arch>. See README.md for why Bun and not Node SEA.
// Bun must be on PATH for that step; the plain build needs only Node.
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { arch, platform } from "node:os";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/rookbox.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Some of the SDK's dependencies are CommonJS and call require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  define: { __ROOKBOX_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
});

if (process.argv.includes("--binary")) {
  const os = platform() === "darwin" ? "darwin" : platform() === "linux" ? "linux" : null;
  const cpu = arch() === "arm64" ? "arm64" : arch() === "x64" ? "x64" : null;
  if (!os || !cpu) throw new Error(`No binary build for ${platform()}/${arch()}`);
  const target = process.env.BUN_TARGET ?? `bun-${os}-${cpu}`;
  const name = target.replace(/^bun-/, "").replace(/-(baseline|modern)$/, "");
  const outfile = `dist/rookbox-${name}`;
  rmSync(outfile, { force: true });
  const result = spawnSync(
    "bun",
    ["build", "--compile", `--target=${target}`, "dist/rookbox.mjs", `--outfile=${outfile}`],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("bun build --compile failed");
  chmodSync(outfile, 0o755);
  console.log(`built ${outfile}`);
}
