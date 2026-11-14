import type { ReconcileReport } from "@rookbox/contracts";
import type { Logger } from "./logger.js";
import { OWNER_TAG } from "./machines/service.js";
import type { MachineStore } from "./machines/store.js";
import type { SpaceClient } from "./space/client.js";

export type ReconcileDeps = {
  store: MachineStore;
  space: Pick<SpaceClient, "list" | "get" | "kill">;
  logger: Logger;
  /** A transitional operation older than this is stuck. */
  stuckAfterMs: number;
  /** A tagged machine with no row younger than this may be a create still writing its row. */
  orphanGraceMs: number;
  now?: () => number;
};

export type ReconcileMode = {
  /** Fix rows: drop those whose machine is gone, clear stuck operations. */
  act: boolean;
  /**
   * Also delete machines that exist on the host with no row. Only with `act`, and only ones whose
   * age is known and past the grace period. Off unless asked for by name.
   */
  killOrphans: boolean;
};

/**
 * Compares the machines the host lists for the service key (the ones tagged `rookbox.owner`) with
 * the `Machine` rows.
 *
 * - Orphan: tagged on the host, no row. A crash between the host's create and the row's insert
 *   leaves one. Never touched unless `killOrphans` is set with `act`.
 * - Missing: a row whose machine the host no longer has (confirmed by asking for it by id, since a
 *   list can be cut short). With `act` the row is removed.
 * - Stuck: a row whose in-flight operation is older than `stuckAfterMs`. With `act` the mark is
 *   cleared, and the status follows what the host shows.
 *
 * Report mode changes nothing. If the host cannot be listed the run fails; it never reads an
 * error as "no machines".
 */
export async function reconcile(
  deps: ReconcileDeps,
  mode: ReconcileMode,
): Promise<ReconcileReport> {
  const now = (deps.now ?? Date.now)();
  const act = mode.act;
  const killOrphans = act && mode.killOrphans;

  const rows = await deps.store.listAll();
  const hosted = (await deps.space.list({})).filter((info) => info.metadata[OWNER_TAG]);
  const byId = new Map(hosted.map((info) => [info.id, info]));
  const rowIds = new Set(rows.map((row) => row.id));

  const report: ReconcileReport = {
    mode: act ? "act" : "report",
    hostMachines: hosted.length,
    rows: rows.length,
    orphans: [],
    pendingOrphans: 0,
    missing: [],
    stuck: [],
    fixed: { rowsRemoved: 0, opsCleared: 0, orphansKilled: 0 },
  };

  const killable: string[] = [];
  for (const info of hosted) {
    if (rowIds.has(info.id)) continue;
    const started = info.startedAt ? Date.parse(info.startedAt) : Number.NaN;
    const known = Number.isFinite(started);
    if (known && now - started < deps.orphanGraceMs) {
      report.pendingOrphans += 1;
      continue;
    }
    report.orphans.push({ id: info.id, ownerId: info.metadata[OWNER_TAG] ?? "" });
    if (known) killable.push(info.id);
  }

  for (const row of rows) {
    // A fork can carry no tag, so a row missing from the list is not yet a row without a machine.
    const exists = byId.has(row.id) || (await deps.space.get(row.id)) !== null;
    if (!exists) {
      report.missing.push(row.id);
      if (act) {
        await deps.store.remove(row.id);
        report.fixed.rowsRemoved += 1;
        deps.logger.info("reconcile: row removed, machine gone", { machine: row.id });
      }
      continue;
    }
    if (row.op && row.opAt && now - row.opAt.getTime() >= deps.stuckAfterMs) {
      report.stuck.push({ id: row.id, op: row.op });
      if (act) {
        await deps.store.setOp(row.id, null);
        report.fixed.opsCleared += 1;
        deps.logger.info("reconcile: stuck operation cleared", { machine: row.id, op: row.op });
      }
    }
  }

  if (report.orphans.length > 0) {
    deps.logger.warn("reconcile: machines on the host without a row", {
      count: report.orphans.length,
      killing: killOrphans,
    });
  }
  if (killOrphans) {
    for (const id of killable) {
      try {
        await deps.space.kill(id);
        report.fixed.orphansKilled += 1;
        deps.logger.warn("reconcile: orphan machine deleted", { machine: id });
      } catch (error) {
        deps.logger.error("reconcile: could not delete orphan", { machine: id, error });
      }
    }
  }
  return report;
}

/** Runs the reconciler every `intervalS` seconds. Errors are logged and the next run goes on. */
export function startReconciler(
  deps: ReconcileDeps,
  mode: ReconcileMode,
  intervalS: number,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    reconcile(deps, mode)
      .then((report) => {
        const issues = report.orphans.length + report.missing.length + report.stuck.length;
        deps.logger.info("reconcile: done", { mode: report.mode, issues, fixed: report.fixed });
      })
      .catch((error: unknown) => deps.logger.error("reconcile: failed", { error }))
      .finally(() => {
        running = false;
      });
  }, intervalS * 1_000);
  timer.unref();
  return () => clearInterval(timer);
}
