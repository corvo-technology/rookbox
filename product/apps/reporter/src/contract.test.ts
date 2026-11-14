import { describe, expect, it } from "vitest";
import { silentLogger as apiLogger } from "../../api/src/logger.js";
import { createIngestHandler } from "../../api/src/usage/ingest.js";
import { memoryUsageStore } from "../../api/src/usage/memory-store.js";
import { createUsageService } from "../../api/src/usage/service.js";
import { silentLogger } from "./log.js";
import { pollOnce } from "./poller.js";
import { createSender } from "./sender.js";
import { config, fakeEcw, machine, memoryDb, SECRET } from "./test-support.js";

const T = Date.UTC(2026, 10, 10, 0, 0, 0);

describe("reporter to API", () => {
  it("a machine's life, polled and delivered, becomes the intervals and totals it should", async () => {
    // The real reporter pipeline into the real ingest route and usage service, in memory.
    const store = memoryUsageStore();
    store.users.set("u1", "u1@example.test");
    let now = T;
    const usage = createUsageService({
      store,
      logger: apiLogger,
      now: () => new Date(now),
      adminEmails: [],
    });
    const ingest = createIngestHandler({
      secret: SECRET,
      usage,
      logger: apiLogger,
      now: () => now,
    });
    const db = memoryDb();
    db.setMeta("last_snapshot_ms", "0");
    const ecw = fakeEcw();
    const cfg = { ...config, snapshotIntervalS: 300 };
    const sender = createSender({
      db,
      logger: silentLogger,
      config: cfg,
      now: () => now,
      fetch: async (url, init) => ingest(new Request(String(url), init)),
    });

    const step = async (seconds: number, machines: ReturnType<typeof machine>[]) => {
      now = T + seconds * 1_000;
      ecw.state.machines = machines;
      await pollOnce({ ecw, db, logger: silentLogger, config: cfg, now: () => now });
      while ((await sender.sendOnce()).kind !== "idle");
    };

    await step(0, [machine("m1")]);
    await step(600, [machine("m1", { state: "suspended" })]);
    await step(1_800, [machine("m1", { vcpu: 4 })]);
    await step(1_830, [machine("m1", { vcpu: 4 }), machine("fork", { owner: null })]);
    await step(3_000, [machine("fork", { owner: null })]);
    await step(3_030, [machine("fork", { owner: null })]);

    const m1 = store
      .intervals()
      .filter((row) => row.machineId === "m1")
      .map((row) => [row.state, row.vcpu, row.seconds]);
    // Running 0-600, suspended 600-1800, then 4 vCPU from 1800 until the last poll that saw it (1830).
    expect(m1).toEqual([
      ["running", 2, 600],
      ["suspended", 2, 1_200],
      ["running", 4, 30],
    ]);
    expect(store.events.every((event) => event.reporterId === "rep1")).toBe(true);
    expect((await store.openIntervals()).map((row) => row.machineId)).toEqual(["fork"]);
    expect(db.pendingCount()).toBe(0);
  });
});
