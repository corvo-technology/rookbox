import type { Config } from "./config.js";
import type { ReporterDb } from "./db.js";
import { diffMachines } from "./diff.js";
import type { EcwClient } from "./ecw.js";
import type { Logger } from "./log.js";
import type { Machine, SnapshotDraft } from "./types.js";

export type PollDeps = {
  ecw: EcwClient;
  db: ReporterDb;
  logger: Logger;
  config: Pick<
    Config,
    | "diskResizeMinMib"
    | "missedPollsForGone"
    | "snapshotIntervalS"
    | "outboxMax"
    | "outboxWarn"
    | "reporterId"
  >;
  now?: () => number;
};

export type PollResult =
  | { ok: true; machines: number; events: number; snapshot: boolean }
  | { ok: false; reason: "list_failed" | "outbox_full" };

const META_LAST_SNAPSHOT = "last_snapshot_ms";
const META_LAST_WARN = "last_outbox_warn_ms";
const WARN_EVERY_MS = 10 * 60_000;

function snapshotOf(
  known: ReadonlyMap<string, Machine>,
  nowMs: number,
  reporterId: string,
): SnapshotDraft {
  return {
    key: `snapshot:${reporterId}:${nowMs}`,
    takenAt: new Date(nowMs).toISOString(),
    machines: [...known.values()].map((m) => ({
      machineId: m.id,
      owner: m.owner,
      template: m.template,
      vcpu: m.vcpu,
      memoryMib: m.memoryMib,
      diskMib: m.diskMib,
      state: m.state,
      startedAt: m.startedAt,
    })),
  };
}

/**
 * One poll: list the machines, turn what changed into events, and queue them, all in one
 * database transaction. A snapshot of every known machine is queued too once
 * `snapshotIntervalS` has passed. If listing fails nothing changes, and the next poll compares
 * against the same last known state, so nothing is lost and nothing is invented.
 */
export async function pollOnce(deps: PollDeps): Promise<PollResult> {
  const { ecw, db, logger, config } = deps;
  const nowMs = (deps.now ?? Date.now)();

  const waiting = db.pendingCount();
  if (waiting >= config.outboxWarn) {
    const lastWarn = Number(db.getMeta(META_LAST_WARN) ?? 0);
    if (nowMs - lastWarn >= WARN_EVERY_MS || waiting >= config.outboxMax) {
      db.setMeta(META_LAST_WARN, String(nowMs));
      logger.warn("outbox is filling up: the API is not acknowledging events", {
        waiting,
        warnAt: config.outboxWarn,
        max: config.outboxMax,
      });
    }
  }
  if (waiting >= config.outboxMax) {
    // Collecting pauses, but the last known state is kept, so when delivery resumes the changes
    // are noticed against it. Events are never dropped; time is just stamped later.
    logger.error("outbox is full: collection is paused until the API catches up", { waiting });
    return { ok: false, reason: "outbox_full" };
  }

  let listed: Machine[];
  try {
    listed = await ecw.listMachines();
  } catch (error) {
    logger.warn("could not list machines", { error });
    return { ok: false, reason: "list_failed" };
  }

  const known = db.knownMachines();
  const diff = diffMachines(known, listed, nowMs, config);
  db.applyPoll(diff);

  let snapshot = false;
  const lastSnapshot = Number(db.getMeta(META_LAST_SNAPSHOT) ?? 0);
  if (nowMs - lastSnapshot >= config.snapshotIntervalS * 1_000) {
    // Built from what was just stored: every machine still considered alive.
    db.enqueueSnapshot(snapshotOf(db.knownMachines(), nowMs, config.reporterId));
    db.setMeta(META_LAST_SNAPSHOT, String(nowMs));
    snapshot = true;
  }

  if (diff.events.length > 0) {
    logger.info("machine changes recorded", {
      events: diff.events.length,
      types: diff.events.map((event) => event.type),
    });
  }
  return { ok: true, machines: listed.length, events: diff.events.length, snapshot };
}
