import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createEcwClient } from "./ecw.js";
import { startHealthServer } from "./health.js";
import { createLogger } from "./log.js";
import { createSender } from "./sender.js";
import { createService } from "./service.js";

const bootLogger = createLogger("info", { service: "rookbox-reporter" });

try {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, {
    service: "rookbox-reporter",
    reporterId: config.reporterId,
  });
  const db = openDb(config.dbPath);
  const ecw = createEcwClient({
    baseUrl: config.ecwUrl,
    apiKey: config.ecwKey,
    timeoutMs: config.ecwTimeoutMs,
  });
  const sender = createSender({ db, logger, config });
  const service = createService({ config, db, ecw, sender, logger });
  const health = await startHealthServer({
    port: config.healthPort,
    status: service.status,
    pollIntervalS: config.pollIntervalS,
  });

  logger.info("reporter started", {
    pollIntervalS: config.pollIntervalS,
    snapshotIntervalS: config.snapshotIntervalS,
    healthPort: config.healthPort,
    pending: db.pendingCount(),
  });
  service.start();

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("stopping", { signal });
    // Whatever is unsent stays in the outbox and goes out on the next start.
    const force = setTimeout(() => process.exit(1), 20_000);
    force.unref();
    await service.stop();
    await new Promise<void>((done) => health.close(() => done()));
    db.close();
    logger.info("stopped");
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
} catch (error) {
  bootLogger.error("reporter failed to start", { error });
  process.exit(1);
}
