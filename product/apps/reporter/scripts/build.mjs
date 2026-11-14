// Bundles the reporter into one file, dist/main.js. It has no runtime dependencies: everything
// it needs is in Node (fetch, node:sqlite, node:http, node:crypto), so the image and the server
// need nothing but Node 22.13 or later.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "warning",
});
