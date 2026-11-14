import { describe, expect, it } from "vitest";
import { silentLogger } from "./logger.js";
import { OWNER_TAG } from "./machines/service.js";
import { reconcile } from "./reconcile.js";
import { SpaceError } from "./space/client.js";
import { fakeSpace, memoryMachineStore } from "./test-support.js";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const MIN = 60_000;
const size = { vcpu: 1, memoryMib: 512, diskMib: 1024 };

function setup() {
  const store = memoryMachineStore();
  const space = fakeSpace();
  const deps = {
    store,
    space,
    logger: silentLogger,
    stuckAfterMs: 10 * MIN,
    orphanGraceMs: 15 * MIN,
    now: () => NOW,
  };
  const host = (id: string, owner: string | null, ageMin: number | null) =>
    space.sandboxes.set(id, {
      id,
      templateId: "seed",
      state: "running",
      metadata: owner ? { [OWNER_TAG]: owner } : {},
      envdAccessToken: "e",
      trafficToken: "t",
      ...(ageMin === null ? {} : { startedAt: new Date(NOW - ageMin * MIN).toISOString() }),
    });
  const row = (id: string, ownerId = "alice", name = id) =>
    store.insert({
      id,
      ownerId,
      name,
      template: "seed",
      size,
      idleTimeoutS: 900,
      forkedFrom: null,
    });
  return { store, space, deps, host, row };
}

describe("reconcile", () => {
  it("reports orphans, missing rows and stuck operations, and changes nothing", async () => {
    const { store, space, deps, host, row } = setup();
    host("ok", "alice", 60);
    await row("ok");
    host("orphan", "alice", 60);
    host("young", "alice", 2);
    host("noage", "bob", null);
    host("foreign", null, 60); // not a Rookbox machine: no tag
    await row("gone");
    host("stuck", "alice", 60);
    await row("stuck");
    await store.setOp("stuck", "deleting");
    store.rows.set("stuck", { ...store.rows.get("stuck")!, opAt: new Date(NOW - 30 * MIN) });

    const report = await reconcile(deps, { act: false, killOrphans: true });
    expect(report.mode).toBe("report");
    expect(report.hostMachines).toBe(5);
    expect(report.rows).toBe(3);
    expect(report.orphans.map((o) => o.id).sort()).toEqual(["noage", "orphan"]);
    expect(report.orphans.find((o) => o.id === "orphan")?.ownerId).toBe("alice");
    expect(report.pendingOrphans).toBe(1);
    expect(report.missing).toEqual(["gone"]);
    expect(report.stuck).toEqual([{ id: "stuck", op: "deleting" }]);
    expect(report.fixed).toEqual({ rowsRemoved: 0, opsCleared: 0, orphansKilled: 0 });
    // Report mode changed nothing, even with the kill flag.
    expect(store.rows.has("gone")).toBe(true);
    expect(store.rows.get("stuck")?.op).toBe("deleting");
    expect(space.calls.some((c) => c.op === "kill")).toBe(false);
  });

  it("with act, fixes rows but never deletes an orphan without the kill flag", async () => {
    const { store, space, deps, host, row } = setup();
    host("orphan", "alice", 60);
    await row("gone");
    host("stuck", "alice", 60);
    await row("stuck");
    await store.setOp("stuck", "suspending");
    store.rows.set("stuck", { ...store.rows.get("stuck")!, opAt: new Date(NOW - 30 * MIN) });

    const report = await reconcile(deps, { act: true, killOrphans: false });
    expect(report.mode).toBe("act");
    expect(report.fixed).toEqual({ rowsRemoved: 1, opsCleared: 1, orphansKilled: 0 });
    expect(store.rows.has("gone")).toBe(false);
    expect(store.rows.get("stuck")?.op).toBeNull();
    expect(space.sandboxes.has("orphan")).toBe(true);
    expect(space.calls.some((c) => c.op === "kill")).toBe(false);
  });

  it("deletes only old orphans of known age, and only with both flags", async () => {
    const { space, deps, host, row } = setup();
    host("keep", "alice", 60);
    await row("keep");
    host("old", "alice", 60);
    host("young", "alice", 2);
    host("noage", "alice", null);
    const report = await reconcile(deps, { act: true, killOrphans: true });
    expect(report.fixed.orphansKilled).toBe(1);
    expect(space.sandboxes.has("old")).toBe(false);
    for (const id of ["keep", "young", "noage"]) expect(space.sandboxes.has(id)).toBe(true);
    // kill without act is ignored.
    host("old2", "alice", 60);
    await reconcile(deps, { act: false, killOrphans: true });
    expect(space.sandboxes.has("old2")).toBe(true);
  });

  it("does not call a row missing when the host answers for it by id (an untagged fork)", async () => {
    const { store, deps, host, row } = setup();
    host("fork", null, 60);
    await row("fork");
    const report = await reconcile(deps, { act: true, killOrphans: false });
    expect(report.missing).toEqual([]);
    expect(store.rows.has("fork")).toBe(true);
  });

  it("leaves a stuck mark younger than the threshold alone", async () => {
    const { store, deps, host, row } = setup();
    host("a", "alice", 60);
    await row("a");
    await store.setOp("a", "restoring");
    store.rows.set("a", { ...store.rows.get("a")!, opAt: new Date(NOW - 2 * MIN) });
    const report = await reconcile(deps, { act: true, killOrphans: false });
    expect(report.stuck).toEqual([]);
    expect(store.rows.get("a")?.op).toBe("restoring");
  });

  it("fails, changing nothing, when the host cannot be listed", async () => {
    const { store, space, deps, row } = setup();
    await row("a");
    space.list = async () => {
      throw new SpaceError(0, "down", "UNREACHABLE");
    };
    await expect(reconcile(deps, { act: true, killOrphans: true })).rejects.toBeInstanceOf(
      SpaceError,
    );
    expect(store.rows.has("a")).toBe(true);
  });

  it("keeps a row when only the by-id check fails", async () => {
    const { store, space, deps, row } = setup();
    await row("a");
    space.get = async () => {
      throw new SpaceError(0, "down", "UNREACHABLE");
    };
    await expect(reconcile(deps, { act: true, killOrphans: false })).rejects.toBeDefined();
    expect(store.rows.has("a")).toBe(true);
  });
});
