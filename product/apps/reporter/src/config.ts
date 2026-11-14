import { hostname } from "node:os";
import { type CustomerRule, parseCustomerRules } from "./customers.js";
import type { LogLevel } from "./log.js";

export type Config = {
  ecwUrl: string;
  ecwKey: string;
  /** Base URL of the product API; events go to `<apiUrl>/ingest/usage-events`. */
  apiUrl: string;
  ingestSecret: string;
  reporterId: string;
  pollIntervalS: number;
  snapshotIntervalS: number;
  dbPath: string;
  healthPort: number;
  batchSize: number;
  /** Events waiting for delivery at which a warning is logged. */
  outboxWarn: number;
  /** Events waiting at which collecting pauses (state is kept, so nothing is lost). */
  outboxMax: number;
  ecwTimeoutMs: number;
  sendTimeoutMs: number;
  /** A disk reading that moves less than this does not count as a resize. */
  diskResizeMinMib: number;
  /** Polls a machine must be missing from before it is reported gone. */
  missedPollsForGone: number;
  /** Metadata keys that file a machine under a customer when it has no `rookbox.owner` tag. */
  customerRules: CustomerRule[];
  logLevel: LogLevel;
};

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function need(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function url(env: NodeJS.ProcessEnv, name: string): string {
  const value = need(env, name).replace(/\/+$/, "");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
  } catch {
    throw new Error(`${name} must be an http(s) URL`);
  }
  return value;
}

/** Reads and validates the environment once, so a bad install fails at start with a clear line. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ingestSecret = need(env, "INGEST_SECRET");
  if (ingestSecret.length < 32) throw new Error("INGEST_SECRET must be at least 32 characters");
  const reporterId = (env.REPORTER_ID?.trim() || hostname()).replace(/[^A-Za-z0-9._-]/g, "-");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(reporterId)) throw new Error("REPORTER_ID is not usable");
  const level = env.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warn", "error"].includes(level)) throw new Error("LOG_LEVEL is invalid");
  const outboxMax = int(env, "OUTBOX_MAX", 100_000, 100, 10_000_000);
  return {
    ecwUrl: url(env, "SPACE_ECW_API_URL"),
    ecwKey: need(env, "SPACE_ECW_API_KEY"),
    apiUrl: url(env, "ROOKBOX_API_URL"),
    ingestSecret,
    reporterId,
    pollIntervalS: int(env, "POLL_INTERVAL_S", 30, 1, 3_600),
    snapshotIntervalS: int(env, "SNAPSHOT_INTERVAL_S", 300, 10, 86_400),
    dbPath: env.REPORTER_DB_PATH?.trim() || "./reporter.sqlite",
    healthPort: int(env, "HEALTH_PORT", 9464, 1, 65_535),
    batchSize: int(env, "BATCH_SIZE", 200, 1, 500),
    outboxWarn: int(env, "OUTBOX_WARN", Math.floor(outboxMax * 0.8), 1, outboxMax),
    outboxMax,
    ecwTimeoutMs: int(env, "ECW_TIMEOUT_MS", 15_000, 1_000, 120_000),
    sendTimeoutMs: int(env, "SEND_TIMEOUT_MS", 15_000, 1_000, 120_000),
    diskResizeMinMib: int(env, "DISK_RESIZE_MIN_MIB", 1_024, 1, 10_000_000),
    missedPollsForGone: int(env, "MISSED_POLLS_FOR_GONE", 2, 1, 20),
    customerRules: parseCustomerRules(env.CUSTOMER_RULES),
    logLevel: level as LogLevel,
  };
}
