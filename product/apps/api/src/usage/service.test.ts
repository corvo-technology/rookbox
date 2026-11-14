import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { periodRange } from "./aggregate.js";
import { formatReport } from "./report.js";
import { usageHandlers } from "./router.js";
import { ev, events, newUsage, resetSeq, snapshot, T0 } from "./test-support.js";

const HOUR = 3_600;

describe("periodRange", () => {
  const now = new Date(Date.UTC(2026, 10, 14, 15, 30));
  it("counts calendar days ending today, in UTC", () => {
    expect(periodRange("7d", now).from.toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(periodRange("30d", now).from.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(periodRange("month", now).from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(periodRange("7d", now).to).toEqual(now);
  });
});

describe("a user's usage", () => {
  it("adds up running and suspended time in integer units, with an open interval counting to now", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(
      events([ev("seen", "m1", 0), ev("suspended", "m1", 600), ev("resumed", "m1", 1_800)]),
    );
    setNow(HOUR);
    const summary = await service.summary("u1", "7d");
    expect(summary.sample).toBe(false);
    expect(summary.totals).toEqual({
      machines: 1,
      runningSeconds: 600 + 1_800,
      vcpuSeconds: 2 * 2_400,
      memoryMibSeconds: 2_048 * 2_400,
      diskMibSeconds: 10_240 * 2_400,
      suspendedSeconds: 1_200,
      suspendedDiskMibSeconds: 10_240 * 1_200,
    });
    expect(summary.byDay).toHaveLength(7);
    expect(summary.byDay.at(-1)).toMatchObject({ day: "2026-11-10", runningSeconds: 2_400 });
    expect(summary.byDay.slice(0, 6).every((day) => day.runningSeconds === 0)).toBe(true);
    expect(summary.byMachine).toEqual([
      expect.objectContaining({ machineId: "m1", state: "running", runningSeconds: 2_400 }),
    ]);
    expect(summary.running).toEqual([
      expect.objectContaining({
        machineId: "m1",
        vcpu: 2,
        since: new Date(T0 + 1_800_000).toISOString(),
      }),
    ]);
  });

  it("splits time that crosses midnight between the two days", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    // 23:00 on the 9th to 01:00 on the 10th.
    await service.ingest(events([ev("seen", "m1", -HOUR), ev("gone", "m1", HOUR)]));
    setNow(2 * HOUR);
    const summary = await service.summary("u1", "7d");
    const days = Object.fromEntries(summary.byDay.map((day) => [day.day, day.runningSeconds]));
    expect(days["2026-11-09"]).toBe(HOUR);
    expect(days["2026-11-10"]).toBe(HOUR);
    expect(summary.totals.runningSeconds).toBe(2 * HOUR);
    expect(summary.byMachine[0]?.state).toBe("deleted");
  });

  it("counts only the part of an interval inside the period", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    // Started 40 days before, still running: the 30-day view caps at its own start.
    await service.ingest(events([ev("seen", "m1", -40 * 86_400)]));
    setNow(HOUR);
    const summary = await service.summary("u1", "30d");
    expect(summary.totals.runningSeconds).toBe(29 * 86_400 + HOUR);
  });

  it("measures each machine on its own", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(
      events([
        ev("seen", "m1", 0),
        ev("seen", "m2", 0, { vcpu: 4, memoryMib: 4_096 }),
        ev("gone", "m1", 300),
        ev("gone", "m2", 900),
      ]),
    );
    setNow(HOUR);
    const summary = await service.summary("u1", "7d");
    expect(summary.totals.machines).toBe(2);
    expect(summary.byMachine.map((m) => [m.machineId, m.runningSeconds, m.vcpuSeconds])).toEqual([
      ["m2", 900, 3_600],
      ["m1", 300, 600],
    ]);
  });

  it("never shows one user another's machines or totals", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(
      events([
        ev("seen", "mine", 0, { owner: "u1" }),
        ev("seen", "theirs", 0, { owner: "u2" }),
        ev("seen", "nobodys", 0, { owner: null }),
      ]),
    );
    setNow(HOUR);
    const a = await service.summary("u1", "7d");
    const b = await service.summary("u2", "7d");
    expect(a.byMachine.map((m) => m.machineId)).toEqual(["mine"]);
    expect(b.byMachine.map((m) => m.machineId)).toEqual(["theirs"]);
    expect(a.running.map((m) => m.machineId)).toEqual(["mine"]);
    expect((await service.summary("u3", "7d")).totals.machines).toBe(0);
  });

  it("reports the reporter's own precision", async () => {
    resetSeq();
    const { service } = newUsage();
    expect((await service.summary("u1", "7d")).measuredEveryS).toBe(30);
    await service.ingest({ ...events([ev("seen", "m1", 0)]), pollIntervalS: 60 });
    expect((await service.summary("u1", "7d")).measuredEveryS).toBe(60);
  });
});

describe("who a machine belongs to", () => {
  it("uses the owner tag, and falls back to the API's own machine record for a fork", async () => {
    resetSeq();
    const { service, store, setNow } = newUsage();
    store.machines.set("fork1", { ownerId: "u2", name: "my-fork" });
    await service.ingest(
      events([ev("seen", "tagged", 0), ev("seen", "fork1", 0, { owner: null })]),
    );
    setNow(HOUR);
    expect((await service.summary("u1", "7d")).byMachine.map((m) => m.machineId)).toEqual([
      "tagged",
    ]);
    const forks = await service.summary("u2", "7d");
    expect(forks.byMachine).toEqual([
      expect.objectContaining({ machineId: "fork1", name: "my-fork" }),
    ]);
  });

  it("puts a machine with no known owner in the unassigned bucket, visible only to an admin", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(
      events([
        ev("seen", "stray", 0, { owner: null }),
        ev("seen", "spoofed", 0, { owner: "not-an-account" }),
      ]),
    );
    setNow(HOUR);
    expect((await service.summary("u1", "7d")).totals.machines).toBe(0);
    const report = await service.admin("7d");
    expect(report.unassigned.machines).toBe(2);
    expect(report.users).toEqual([]);
  });

  it("assigns a machine once the API's record of it appears", async () => {
    resetSeq();
    const { service, store, setNow } = newUsage();
    await service.ingest(events([ev("seen", "fork1", 0, { owner: null })]));
    expect((await service.admin("7d")).unassigned.machines).toBe(1);
    store.machines.set("fork1", { ownerId: "u1", name: "late" });
    await service.ingest(events([ev("seen", "other", 5, { owner: "u2" })]));
    setNow(HOUR);
    expect((await service.admin("7d")).unassigned.machines).toBe(0);
    expect((await service.summary("u1", "7d")).totals.machines).toBe(1);
  });
});

describe("snapshots repair gaps", () => {
  const openState = (store: ReturnType<typeof newUsage>["store"], id: string) =>
    store
      .intervals()
      .filter((row) => row.machineId === id)
      .map((row) => [
        row.state,
        (row.startedAt.getTime() - T0) / 1000,
        row.endedAt && (row.endedAt.getTime() - T0) / 1000,
      ]);

  it("opens a machine the events never mentioned", async () => {
    resetSeq();
    const { service, store } = newUsage();
    const ack = await service.ingest(snapshot(120, [{ machineId: "m1" }]));
    expect(ack.accepted).toBe(1);
    expect(openState(store, "m1")).toEqual([["running", 120, null]]);
    expect(store.events[0]?.source).toBe("snapshot");
  });

  it("closes a machine that is open here but missing from the snapshot, at the snapshot time", async () => {
    resetSeq();
    const { service, store } = newUsage();
    await service.ingest(events([ev("seen", "m1", 0)]));
    await service.ingest(snapshot(300, []));
    expect(openState(store, "m1")).toEqual([["running", 0, 300]]);
  });

  it("splits a machine whose state changed during the gap", async () => {
    resetSeq();
    const { service, store } = newUsage();
    await service.ingest(events([ev("seen", "m1", 0)]));
    await service.ingest(snapshot(300, [{ machineId: "m1", state: "suspended" }]));
    expect(openState(store, "m1")).toEqual([
      ["running", 0, 300],
      ["suspended", 300, null],
    ]);
  });

  it("adds nothing when the snapshot agrees, however many arrive", async () => {
    resetSeq();
    const { service, store } = newUsage();
    await service.ingest(events([ev("seen", "m1", 0)]));
    await service.ingest(snapshot(300, [{ machineId: "m1" }]));
    await service.ingest(snapshot(600, [{ machineId: "m1" }]));
    expect(store.events).toHaveLength(1);
    expect(openState(store, "m1")).toEqual([["running", 0, null]]);
  });

  it("does not close another reporter's machines", async () => {
    resetSeq();
    const { service, store } = newUsage();
    await service.ingest(events([ev("seen", "elsewhere", 0)], "rep2"));
    await service.ingest(snapshot(300, [], "rep1"));
    expect(openState(store, "elsewhere")).toEqual([["running", 0, null]]);
  });

  it("is idempotent when the same snapshot is delivered twice", async () => {
    resetSeq();
    const { service, store } = newUsage();
    const message = snapshot(120, [{ machineId: "m1" }]);
    await service.ingest(message);
    const again = await service.ingest(message);
    expect(again.accepted).toBe(0);
    expect(store.events).toHaveLength(1);
  });

  it("ignores a snapshot older than what it would overwrite", async () => {
    resetSeq();
    const { service, store } = newUsage();
    await service.ingest(events([ev("seen", "m1", 500)]));
    await service.ingest(snapshot(100, []));
    expect(openState(store, "m1")).toEqual([["running", 500, null]]);
  });
});

describe("a reporter that has gone quiet", () => {
  it("stops open machines from accruing past its last contact", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(events([ev("seen", "m1", 0)]));
    setNow(HOUR); // contact recorded at this clock time
    await service.ingest(events([ev("seen", "m2", HOUR)]));
    setNow(10 * HOUR);
    const summary = await service.summary("u1", "7d");
    // Silent for nine hours: counting stops at the last contact (one hour in).
    expect(summary.byMachine.find((m) => m.machineId === "m1")?.runningSeconds).toBe(HOUR);
    const report = await service.admin("7d");
    expect(report.reporter.stale).toBe(true);
    expect(report.reporter.lastContactAgeS).toBe(9 * HOUR);
  });
});

describe("the admin view", () => {
  it("lists usage per user, the unassigned bucket and the reporter's age", async () => {
    resetSeq();
    const { service, setNow } = newUsage();
    await service.ingest(
      events([
        ev("seen", "a", 0, { owner: "u1" }),
        ev("seen", "b", 0, { owner: "u2" }),
        ev("seen", "c", 0, { owner: null }),
        ev("gone", "b", 600, { owner: "u2" }),
      ]),
    );
    setNow(HOUR + 30);
    const report = await service.admin("30d");
    expect(report.users.map((user) => [user.email, user.machines, user.runningSeconds])).toEqual([
      ["u1@example.test", 1, HOUR + 30],
      ["u2@example.test", 1, 600],
    ]);
    expect(report.unassigned).toMatchObject({ machines: 1, runningSeconds: HOUR + 30 });
    expect(report.reporter).toMatchObject({
      lastContactAgeS: 30,
      lastEventAgeS: 30,
      stale: false,
    });
    expect(formatReport(report)).toContain("u1@example.test");
    expect(formatReport(report)).toContain("(unassigned)");
  });

  it("reports a reporter that never got through", async () => {
    resetSeq();
    const { service } = newUsage();
    const report = await service.admin("7d");
    expect(report.reporter).toEqual({
      lastContactAt: null,
      lastContactAgeS: null,
      lastEventAt: null,
      lastEventAgeS: null,
      stale: true,
    });
  });

  it("is for admins only, by email and without regard to case", async () => {
    const { service } = newUsage({ admins: ["Admin@Example.test"] });
    const handlers = usageHandlers(service);
    await expect(handlers.admin({ email: "user@example.test" }, "7d")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(handlers.admin({ email: "admin@example.test" }, "7d")).resolves.toMatchObject({
      period: "7d",
    });
  });

  it("answers 503 when usage is not wired", async () => {
    const handlers = usageHandlers(undefined);
    await expect(handlers.summary({ id: "u1" }, "7d")).rejects.toBeInstanceOf(ORPCError);
  });
});
