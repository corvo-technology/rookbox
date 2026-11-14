// `pnpm usage:reassign --customer rook (--metadata-key corvo | --machine ID ...) [--apply]`
//
// Files usage already recorded as "unassigned" under a customer. Machines are named with
// `--machine` (repeatable; the only way to reach a machine that no longer exists) or found with
// `--metadata-key`, which lists the machines the sandbox server has now (SPACE_ECW_API_URL and
// SPACE_ECW_API_KEY) and takes those whose metadata has that key. It only moves time that has no
// owner. Dry run unless `--apply`; safe to run again.
import { createDb } from "../db.js";
import { loadEnv } from "../env.js";
import { createPrismaUsageStore } from "../usage/prisma-store.js";
import { reassignToCustomer } from "../usage/reassign.js";

function flags(argv: string[]) {
  const out = { customer: "", metadataKey: "", machines: [] as string[], apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--customer") out.customer = argv[++i] ?? "";
    else if (arg === "--metadata-key") out.metadataKey = argv[++i] ?? "";
    else if (arg === "--machine") out.machines.push(argv[++i] ?? "");
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

/** Ids of the machines the server lists now whose metadata has `key`. */
async function machinesWithMetadata(key: string): Promise<string[]> {
  const base = process.env.SPACE_ECW_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.SPACE_ECW_API_KEY;
  if (!base || !apiKey)
    throw new Error("--metadata-key needs SPACE_ECW_API_URL and SPACE_ECW_API_KEY");
  const ids: string[] = [];
  let token: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (token) query.set("nextToken", token);
    const response = await fetch(`${base}/v2/sandboxes?${query}`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`list answered ${response.status}`);
    const body = (await response.json()) as {
      sandboxID?: string;
      metadata?: Record<string, unknown>;
    }[];
    for (const item of body) {
      if (item.sandboxID && item.metadata && Object.hasOwn(item.metadata, key)) {
        ids.push(item.sandboxID);
      }
    }
    token = response.headers.get("x-next-token") || null;
  } while (token);
  return ids;
}

if (
  process.argv[1]?.endsWith("usage-reassign.js") ||
  process.argv[1]?.endsWith("usage-reassign.ts")
) {
  let args: ReturnType<typeof flags>;
  try {
    args = flags(process.argv.slice(2));
    if (!args.customer || (!args.metadataKey && args.machines.length === 0)) throw new Error("");
  } catch (error) {
    const why = error instanceof Error && error.message ? `${error.message}\n` : "";
    process.stderr.write(
      `${why}Usage: usage:reassign --customer ID (--metadata-key KEY | --machine ID ...) [--apply]\n`,
    );
    process.exit(2);
  }
  const env = loadEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    const found = args.metadataKey ? await machinesWithMetadata(args.metadataKey) : [];
    const result = await reassignToCustomer(createPrismaUsageStore(db), {
      machineIds: [...found, ...args.machines],
      customerId: args.customer,
      apply: args.apply,
    });
    process.stdout.write(
      `${result.applied ? "Moved" : "Would move"} ${result.machineIds.length} machine(s) to ${result.owner}; left ${result.skipped.length} alone.\n`,
    );
    for (const id of result.machineIds) process.stdout.write(`  ${id}\n`);
    if (!result.applied) process.stdout.write("Dry run. Add --apply to write.\n");
  } finally {
    await close();
  }
}
