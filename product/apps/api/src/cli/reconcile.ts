// `pnpm reconcile`: compares the machines the host lists for the service key with the database.
// Reports only, unless told to act:
//   node dist/cli/reconcile.js                       report (changes nothing)
//   node dist/cli/reconcile.js --act                 also drop rows whose machine is gone and
//                                                    clear operations stuck too long
//   node dist/cli/reconcile.js --act --kill-orphans  also DELETE machines that have no row
//   --json                                           print the report as JSON
// Needs the same environment as the server.
import { createDb } from "../db.js";
import { loadEnv } from "../env.js";
import { createLogger } from "../logger.js";
import { createPrismaMachineStore } from "../machines/store.js";
import { reconcile } from "../reconcile.js";
import { createEcwClient } from "../space/client.js";

const args = new Set(process.argv.slice(2));
const known = new Set(["--act", "--kill-orphans", "--json"]);
const unknown = [...args].filter((arg) => !known.has(arg));
if (unknown.length > 0 || (args.has("--kill-orphans") && !args.has("--act"))) {
  process.stderr.write(
    unknown.length > 0
      ? `Unknown option: ${unknown.join(" ")}\n`
      : "--kill-orphans needs --act: deleting machines is never the default.\n",
  );
  process.exit(2);
}

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, { service: "rookbox-api" });
const { db, close } = createDb(env.DATABASE_URL);
try {
  const report = await reconcile(
    {
      store: createPrismaMachineStore(db),
      space: createEcwClient({
        baseUrl: env.SPACE_ECW_API_URL,
        apiKey: env.SPACE_ECW_API_KEY,
        domain: env.E2B_DOMAIN,
        timeoutMs: env.SPACE_TIMEOUT_MS,
      }),
      logger,
      stuckAfterMs: env.RECONCILE_STUCK_AFTER_S * 1_000,
      orphanGraceMs: env.RECONCILE_ORPHAN_GRACE_S * 1_000,
    },
    { act: args.has("--act"), killOrphans: args.has("--kill-orphans") },
  );
  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Mode: ${report.mode}`,
        `Machines on the host (tagged): ${report.hostMachines}, rows: ${report.rows}`,
        `Orphans (on the host, no row): ${report.orphans.map((o) => o.id).join(", ") || "none"}`,
        `Pending (too new to judge): ${report.pendingOrphans}`,
        `Missing (row, no machine): ${report.missing.join(", ") || "none"}`,
        `Stuck operations: ${report.stuck.map((s) => `${s.id} (${s.op})`).join(", ") || "none"}`,
        `Fixed: ${report.fixed.rowsRemoved} rows removed, ${report.fixed.opsCleared} operations cleared, ${report.fixed.orphansKilled} orphans deleted`,
        "",
      ].join("\n"),
    );
  }
} finally {
  await close();
}
