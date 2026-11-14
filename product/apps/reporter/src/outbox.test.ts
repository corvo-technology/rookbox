import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./db.js";
import { silentLogger } from "./log.js";
import { pollOnce } from "./poller.js";
import { config, fakeEcw, machine, memoryDb } from "./test-support.js";

const T = Date.UTC(2026, 10, 10, 12, 0, 0);

function poller(overrides: Partial<typeof config> = {}) {
  const db = memoryDb();
  const ecw = fakeEcw();
  const cfg = { ...config, ...overrides };
  const poll = (nowMs: number) =>
    pollOnce({ ecw, db, logger: silentLogger, config: cfg, now: () => nowMs });
  return { db, ecw, poll };
}

const types = (db: ReturnType<typeof memoryDb>) =>
  db.pending(1_000).map((row) => {
    const payload = JSON.parse(row.payload);
    return row.kind === "snapshot"
      ? `snapshot(${payload.machines.length})`
      : `${payload.type}:${payload.machineId}`;
  });

describe("polling into the outbox", () => {
  it("queues events in order with growing sequence numbers", async () => {
    const { db, ecw, poll } = poller({ snapshotIntervalS: 100_000 });
    ecw.state.machines = [machine("m1")];
    await poll(T);
    ecw.state.machines = [machine("m1", { state: "suspended" }), machine("m2")];
    await poll(T + 30_000);
    ecw.state.machines = [machine("m1")];
    await poll(T + 60_000);
    const rows = db.pending(100);
    expect(types(db)).toEqual(["seen:m1", "suspended:m1", "seen:m2", "resumed:m1"]);
    expect(rows.map((row) => row.seq)).toEqual(
      [...rows.map((row) => row.seq)].sort((a, b) => a - b),
    );
    expect(new Set(rows.map((row) => row.seq)).size).toBe(rows.length);
  });

  it("closes a machine that vanished at the last poll that saw it", async () => {
    const { db, ecw, poll } = poller({ snapshotIntervalS: 100_000 });
    ecw.state.machines = [machine("m1")];
    await poll(T);
    await poll(T + 30_000);
    ecw.state.machines = [];
    await poll(T + 60_000);
    await poll(T + 90_000);
    const gone = db
      .pending(100)
      .map((row) => JSON.parse(row.payload))
      .find((e) => e.type === "gone");
    expect(gone.observedAt).toBe(new Date(T + 30_000).toISOString());
  });

  it("changes nothing when the list fails, then carries on from the same state", async () => {
    const { db, ecw, poll } = poller({ snapshotIntervalS: 100_000 });
    ecw.state.machines = [machine("m1")];
    await poll(T);
    ecw.state.fail = new Error("down");
    expect(await poll(T + 30_000)).toEqual({ ok: false, reason: "list_failed" });
    ecw.state.fail = null;
    await poll(T + 60_000);
    expect(types(db)).toEqual(["seen:m1"]);
    expect(db.knownMachines().get("m1")?.lastSeenMs).toBe(T + 60_000);
  });

  it("queues a snapshot of every known machine on its schedule, and not between", async () => {
    const { db, ecw, poll } = poller({ snapshotIntervalS: 300 });
    db.setMeta("last_snapshot_ms", "0");
    ecw.state.machines = [machine("m1"), machine("m2", { state: "suspended" })];
    await poll(T);
    await poll(T + 30_000);
    await poll(T + 299_000);
    expect(types(db)).toEqual(["seen:m1", "seen:m2", "snapshot(2)"]);
    await poll(T + 301_000);
    expect(types(db).filter((t) => t.startsWith("snapshot"))).toHaveLength(2);
    const snap = JSON.parse(
      db.pending(100).find((row) => row.kind === "snapshot")?.payload ?? "{}",
    );
    expect(snap.machines.map((m: { state: string }) => m.state)).toEqual(["running", "suspended"]);
  });

  it("warns, then pauses collecting at the cap without losing state", async () => {
    const warnings: string[] = [];
    const logger = {
      ...silentLogger,
      warn: (message: string) => void warnings.push(message),
      error: (message: string) => void warnings.push(message),
    };
    const db = memoryDb();
    const ecw = fakeEcw();
    const cfg = { ...config, outboxWarn: 2, outboxMax: 3, snapshotIntervalS: 100_000 };
    const poll = (nowMs: number) => pollOnce({ ecw, db, logger, config: cfg, now: () => nowMs });
    ecw.state.machines = [machine("a"), machine("b"), machine("c")];
    await poll(T);
    expect(db.pendingCount()).toBe(3);
    ecw.state.machines = [machine("a"), machine("b"), machine("c"), machine("d")];
    expect(await poll(T + 30_000)).toEqual({ ok: false, reason: "outbox_full" });
    expect(warnings.some((w) => w.includes("filling up"))).toBe(true);
    expect(warnings.some((w) => w.includes("full"))).toBe(true);
    expect(db.knownMachines().has("d")).toBe(false);
    // Delivery catches up; the machine that appeared meanwhile is noticed then.
    db.markSent(
      db.pending(10).map((row) => row.seq),
      T,
    );
    await poll(T + 60_000);
    expect(types(db)).toEqual(["seen:d"]);
  });
});

describe("the outbox on disk", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("survives a restart with the same events, the same sequence and the machine state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rbx-reporter-"));
    dirs.push(dir);
    const path = join(dir, "state", "reporter.sqlite");
    const first = openDb(path);
    const ecw = fakeEcw([machine("m1")]);
    await pollOnce({ ecw, db: first, logger: silentLogger, config, now: () => T });
    const before = first.pending(10).map((row) => [row.seq, row.key]);
    first.close();

    const second = openDb(path);
    expect(second.pending(10).map((row) => [row.seq, row.key])).toEqual(before);
    expect(second.knownMachines().has("m1")).toBe(true);
    // Polling the same machine again adds nothing: it is already known.
    await pollOnce({ ecw, db: second, logger: silentLogger, config, now: () => T + 30_000 });
    expect(second.pending(10).map((row) => row.key)).toEqual(before.map(([, key]) => key));
    second.close();
  });

  it("never reuses a sequence number, even after delivered rows are pruned", async () => {
    const db = memoryDb();
    const ecw = fakeEcw([machine("m1")]);
    await pollOnce({
      ecw,
      db,
      logger: silentLogger,
      config: { ...config, snapshotIntervalS: 100_000 },
      now: () => T,
    });
    const [first] = db.pending(10);
    db.markSent([first?.seq ?? 0], T);
    db.prune(T + 1);
    ecw.state.machines = [machine("m1", { state: "suspended" })];
    await pollOnce({
      ecw,
      db,
      logger: silentLogger,
      config: { ...config, snapshotIntervalS: 100_000 },
      now: () => T + 30_000,
    });
    expect(db.pending(10)[0]?.seq).toBeGreaterThan(first?.seq ?? 0);
  });
});
