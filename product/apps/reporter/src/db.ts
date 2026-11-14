import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DiffResult } from "./diff.js";
import type { Known, OutboxRow, SnapshotDraft } from "./types.js";

/**
 * The reporter's local state, in SQLite (Node's built-in `node:sqlite`, so there is nothing to
 * install or compile; it is stable enough here, and prints one "experimental" warning on
 * Node 22):
 *
 * - `machines`: the last known state of every machine, for detecting changes.
 * - `outbox`: every event and snapshot waiting for the API to acknowledge it. `seq` is an
 *   AUTOINCREMENT key, so it only ever grows, even after old rows are pruned.
 * - `meta`: small facts such as when the last snapshot was queued.
 */
export interface ReporterDb {
  knownMachines(): Map<string, Known>;
  /** Applies one poll: the machine table and the new events change together or not at all. */
  applyPoll(diff: DiffResult): number[];
  enqueueSnapshot(snapshot: SnapshotDraft): number;
  /** Unsent rows in order, up to `limit`. */
  pending(limit: number): OutboxRow[];
  pendingCount(): number;
  oldestPendingMs(): number | null;
  markSent(seqs: readonly number[], atMs: number): void;
  /** Gives up on a row the API refuses as malformed, so it does not block the rest. */
  markRejected(seq: number, atMs: number): void;
  /** Forgets rows delivered more than `olderThanMs` ago. */
  prune(olderThanMs: number): number;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  owner TEXT,
  template TEXT NOT NULL,
  vcpu INTEGER NOT NULL,
  memory_mib INTEGER NOT NULL,
  disk_mib INTEGER NOT NULL,
  state TEXT NOT NULL,
  started_at TEXT,
  last_seen_ms INTEGER NOT NULL,
  missed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  observed_ms INTEGER NOT NULL,
  -- 0 pending, 1 delivered, 2 refused by the API
  status INTEGER NOT NULL DEFAULT 0,
  done_ms INTEGER
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (status, seq);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

type Row = Record<string, string | number | null>;

export function openDb(path: string): ReporterDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec(SCHEMA);

  const insertEvent = db.prepare(
    "INSERT OR IGNORE INTO outbox (key, kind, payload, observed_ms) VALUES (?, 'event', ?, ?)",
  );
  const insertSnapshot = db.prepare(
    "INSERT OR IGNORE INTO outbox (key, kind, payload, observed_ms) VALUES (?, 'snapshot', ?, ?)",
  );
  const upsertMachine = db.prepare(`
    INSERT INTO machines (id, owner, template, vcpu, memory_mib, disk_mib, state, started_at, last_seen_ms, missed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, template = excluded.template,
      vcpu = excluded.vcpu, memory_mib = excluded.memory_mib, disk_mib = excluded.disk_mib,
      state = excluded.state, started_at = excluded.started_at,
      last_seen_ms = excluded.last_seen_ms, missed = excluded.missed`);
  const deleteMachine = db.prepare("DELETE FROM machines WHERE id = ?");
  const lastSeq = db.prepare("SELECT seq FROM outbox WHERE key = ?");

  function transaction<T>(work: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const seqOf = (key: string) => Number((lastSeq.get(key) as Row).seq);

  return {
    knownMachines() {
      const rows = db.prepare("SELECT * FROM machines").all() as Row[];
      return new Map(
        rows.map((row) => [
          String(row.id),
          {
            id: String(row.id),
            owner: row.owner === null ? null : String(row.owner),
            template: String(row.template),
            vcpu: Number(row.vcpu),
            memoryMib: Number(row.memory_mib),
            diskMib: Number(row.disk_mib),
            state: row.state === "suspended" ? "suspended" : "running",
            startedAt: row.started_at === null ? null : String(row.started_at),
            lastSeenMs: Number(row.last_seen_ms),
            missed: Number(row.missed),
          } satisfies Known,
        ]),
      );
    },

    applyPoll(diff) {
      return transaction(() => {
        const seqs: number[] = [];
        for (const event of diff.events) {
          insertEvent.run(event.key, JSON.stringify(event), Date.parse(event.observedAt));
          seqs.push(seqOf(event.key));
        }
        for (const m of diff.upserts) {
          upsertMachine.run(
            m.id,
            m.owner,
            m.template,
            m.vcpu,
            m.memoryMib,
            m.diskMib,
            m.state,
            m.startedAt,
            m.lastSeenMs,
            m.missed,
          );
        }
        for (const id of diff.removals) deleteMachine.run(id);
        return seqs;
      });
    },

    enqueueSnapshot(snapshot) {
      insertSnapshot.run(snapshot.key, JSON.stringify(snapshot), Date.parse(snapshot.takenAt));
      return seqOf(snapshot.key);
    },

    pending(limit) {
      const rows = db
        .prepare(
          "SELECT seq, key, kind, payload, observed_ms FROM outbox WHERE status = 0 ORDER BY seq LIMIT ?",
        )
        .all(limit) as Row[];
      return rows.map((row) => ({
        seq: Number(row.seq),
        key: String(row.key),
        kind: row.kind === "snapshot" ? "snapshot" : "event",
        payload: String(row.payload),
        observedMs: Number(row.observed_ms),
      }));
    },

    pendingCount() {
      return Number(
        (db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 0").get() as Row).n,
      );
    },

    oldestPendingMs() {
      const row = db
        .prepare("SELECT MIN(observed_ms) AS t FROM outbox WHERE status = 0")
        .get() as Row;
      return row.t === null ? null : Number(row.t);
    },

    markSent(seqs, atMs) {
      const mark = db.prepare(
        "UPDATE outbox SET status = 1, done_ms = ? WHERE seq = ? AND status = 0",
      );
      transaction(() => {
        for (const seq of seqs) mark.run(atMs, seq);
      });
    },

    markRejected(seq, atMs) {
      db.prepare("UPDATE outbox SET status = 2, done_ms = ? WHERE seq = ?").run(atMs, seq);
    },

    prune(olderThanMs) {
      const result = db
        .prepare("DELETE FROM outbox WHERE status = 1 AND done_ms < ?")
        .run(olderThanMs);
      return Number(result.changes);
    },

    getMeta(key) {
      const row = db.prepare("SELECT v FROM meta WHERE k = ?").get(key) as Row | undefined;
      return row ? String(row.v) : null;
    },

    setMeta(key, value) {
      db.prepare(
        "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      ).run(key, value);
    },

    close() {
      db.close();
    },
  };
}
