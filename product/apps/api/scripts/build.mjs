// Bundles the server into dist/. Workspace packages ship TypeScript source, so they are bundled
// in; every other dependency stays external and is installed in the production image.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {});

for (const entry of ["index", "cli/migrate", "cli/seed-owner", "cli/reconcile", "cli/usage"]) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: true,
    external,
    // The Prisma client is generated TypeScript; it is bundled, its runtime stays external.
    conditions: ["node", "development"],
    logLevel: "warning",
  });
}
