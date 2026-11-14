import type { AdminHealth } from "@rookbox/contracts";
import type { Logger } from "./logger.js";
import type { SpaceClient } from "./space/client.js";
import type { UsageService } from "./usage/service.js";

export type AdminHealthDeps = {
  now(): number;
  startedAt: number;
  /** Resolves when the database answers. */
  checkDb?: () => Promise<void>;
  space?: Pick<SpaceClient, "probe" | "list">;
  usage?: Pick<UsageService, "reporter">;
  /** Machines the API holds a record of. */
  countRows(): Promise<number>;
  maxRunning: number;
  maxPerUser: number;
  logger: Logger;
};

/**
 * What the operator panel shows first. Each part is read on its own, so one that fails leaves the
 * others standing: the database down is a red light, not an error page. Reads only, and nothing
 * here carries an address, a key or an upstream message.
 */
export function createAdminHealth(deps: AdminHealthDeps) {
  const { logger } = deps;

  async function db(): Promise<AdminHealth["db"]> {
    try {
      await deps.checkDb?.();
      return { ok: true };
    } catch (error) {
      logger.error("admin health: database check failed", { error });
      return { ok: false };
    }
  }

  async function host(): Promise<AdminHealth["host"]> {
    const probe = await deps.space?.probe();
    if (!probe)
      return { ok: false, reachable: false, auth: "unknown", keyConfigured: false, ms: 0 };
    return {
      ok: probe.reachable && probe.auth === "ok",
      reachable: probe.reachable,
      auth: probe.auth,
      keyConfigured: probe.keyConfigured,
      ms: Math.max(0, Math.round(probe.ms)),
    };
  }

  async function capacity(): Promise<AdminHealth["capacity"]> {
    if (!deps.space) return null;
    try {
      const [listed, rows] = await Promise.all([deps.space.list({}), deps.countRows()]);
      return {
        running: listed.filter((info) => info.state === "running").length,
        suspended: listed.filter((info) => info.state === "paused").length,
        maxRunning: deps.maxRunning,
        maxPerUser: deps.maxPerUser,
        rows,
      };
    } catch (error) {
      logger.warn("admin health: capacity could not be read", { error });
      return null;
    }
  }

  async function reporter(): Promise<AdminHealth["reporter"]> {
    if (!deps.usage) return null;
    try {
      const { lastContactAt, lastContactAgeS, stale } = await deps.usage.reporter();
      return { lastContactAt, lastContactAgeS, stale };
    } catch (error) {
      logger.warn("admin health: the usage meter could not be read", { error });
      return null;
    }
  }

  return async function health(): Promise<AdminHealth> {
    const [database, hostState, capacityState, reporterState] = await Promise.all([
      db(),
      host(),
      capacity(),
      reporter(),
    ]);
    return {
      at: new Date(deps.now()).toISOString(),
      api: { uptimeS: Math.max(0, Math.round((deps.now() - deps.startedAt) / 1000)) },
      db: database,
      host: hostState,
      reporter: reporterState,
      capacity: capacityState,
    };
  };
}

export type AdminHealthReader = ReturnType<typeof createAdminHealth>;
