// `pnpm usage:report [--period 7d|30d|month]`: prints usage per user for the period, the
// unassigned bucket, and how long ago the usage reporter last got through. Needs the same
// environment as the server (DATABASE_URL is the part it uses). Read-only.
import { UsagePeriodSchema } from "@rookbox/contracts";
import { createDb } from "../db.js";
import { loadEnv } from "../env.js";
import { createLogger } from "../logger.js";
import { createPrismaUsageStore } from "../usage/prisma-store.js";
import { formatReport } from "../usage/report.js";
import { createUsageService } from "../usage/service.js";

if (process.argv[1]?.endsWith("usage.js") || process.argv[1]?.endsWith("usage.ts")) {
  const flag = process.argv.indexOf("--period");
  const period = UsagePeriodSchema.safeParse(flag >= 0 ? process.argv[flag + 1] : "30d");
  if (!period.success) {
    process.stderr.write("Usage: usage:report [--period 7d|30d|month]\n");
    process.exit(2);
  }
  const env = loadEnv();
  const logger = createLogger("error", { service: "rookbox-usage-report" });
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    const usage = createUsageService({
      store: createPrismaUsageStore(db),
      logger,
      adminEmails: [],
    });
    process.stdout.write(`${formatReport(await usage.admin(period.data))}\n`);
  } finally {
    await close();
  }
}
