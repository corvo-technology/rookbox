import { afterEach, describe, expect, it } from "vitest";
import { silentLogger } from "./log.js";
import { pollOnce } from "./poller.js";
import { backoffMs, createSender, nextBatch } from "./sender.js";
import { createService } from "./service.js";
import { config, fakeApi, fakeEcw, machine, memoryDb } from "./test-support.js";
import type { OutboxRow } from "./types.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup(overrides: Partial<typeof config> = {}) {
  const api = await fakeApi();
  closers.push(api.close);
  const db = memoryDb();
  const cfg = { ...config, apiUrl: api.url, snapshotIntervalS: 100_000, ...overrides };
  const sender = createSender({ db, logger: silentLogger, config: cfg });
  /** Queues `count` machines' first sightings, one event each. */
  const queue = async (count: number, from = 0) => {
    const ecw = fakeEcw(Array.from({ length: count }, (_, i) => machine(`m${from + i}`)));
    await pollOnce({
      ecw,
      db,
      logger: silentLogger,
      config: cfg,
      now: () => Date.UTC(2026, 10, 10, 12, 0, 0) + from,
    });
  };
  /** Sends until nothing is left, retrying failures at once. */
  const drain = async () => {
    for (let n = 0; n < 200; n += 1) {
      const outcome = await sender.sendOnce();
      if (outcome.kind === "idle") return;
    }
    throw new Error("did not drain");
  };
  return { api, db, cfg, sender, queue, drain };
}

describe("backoff", () => {
  it("doubles from a second up to five minutes, with a little jitter", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4].map((n) => backoffMs(n, mid))).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(backoffMs(30, mid)).toBe(300_000);
    expect(backoffMs(3, () => 0)).toBe(3_000);
    expect(backoffMs(3, () => 1)).toBe(5_000);
  });
});

describe("nextBatch", () => {
  const row = (seq: number, kind: OutboxRow["kind"]): OutboxRow => ({
    seq,
    key: `k${seq}`,
    kind,
    payload: "{}",
    observedMs: 0,
  });
  it("sends a snapshot alone, and stops events at the next snapshot or the batch size", () => {
    expect(nextBatch([row(1, "snapshot"), row(2, "event")], 200).map((r) => r.seq)).toEqual([1]);
    expect(
      nextBatch([row(1, "event"), row(2, "event"), row(3, "snapshot"), row(4, "event")], 200).map(
        (r) => r.seq,
      ),
    ).toEqual([1, 2]);
    expect(
      nextBatch([row(1, "event"), row(2, "event"), row(3, "event")], 2).map((r) => r.seq),
    ).toEqual([1, 2]);
    expect(nextBatch([], 5)).toEqual([]);
  });
});

describe("delivery", () => {
  it("signs every request over the exact body, with a timestamp and a stable reporter id", async () => {
    const { api, queue, drain } = await setup();
    await queue(2);
    await drain();
    expect(api.received.length).toBeGreaterThan(0);
    for (const request of api.received) {
      expect(request.verdict).toBe("ok");
      expect(request.headers["x-rookbox-reporter-id"]).toBe("rep1");
      expect(request.headers["x-rookbox-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    }
  });

  it("sends up to the batch size per request, in order, and marks them sent only after the ack", async () => {
    const { api, db, queue, drain } = await setup({ batchSize: 200 });
    await queue(450);
    expect(db.pendingCount()).toBe(450);
    await drain();
    expect(db.pendingCount()).toBe(0);
    const sizes = api.received.map((request) => JSON.parse(request.body).events.length);
    expect(sizes).toEqual([200, 200, 50]);
    const seqs = api.received.flatMap((request) =>
      JSON.parse(request.body).events.map((e: { seq: number }) => e.seq),
    );
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(450);
    expect(api.stored.size).toBe(450);
  });

  it("keeps events when the API is down, and delivers them later, in order, once", async () => {
    const { api, db, queue, sender, drain } = await setup();
    await queue(5);
    api.control.failNext = [503, 502, 500];
    for (let n = 0; n < 3; n += 1) {
      const outcome = await sender.sendOnce();
      expect(outcome.kind).toBe("retry");
      expect(db.pendingCount()).toBe(5);
    }
    await drain();
    expect(db.pendingCount()).toBe(0);
    expect([...api.stored.keys()]).toHaveLength(5);
  });

  it("does not duplicate when the answer is lost after the API stored the batch", async () => {
    const { api, db, queue, sender, drain } = await setup();
    await queue(3);
    api.control.dropAckNext = 1;
    const lost = await sender.sendOnce();
    expect(lost.kind).toBe("retry");
    expect(db.pendingCount()).toBe(3);
    expect(api.stored.size).toBe(3);
    await drain();
    expect(db.pendingCount()).toBe(0);
    // The API saw the same keys twice and kept each once.
    expect(api.received).toHaveLength(2);
    expect(api.stored.size).toBe(3);
  });

  it("keeps everything, and retries, on a 401 or a 429", async () => {
    const { api, db, queue, sender } = await setup();
    await queue(2);
    api.control.failNext = [401, 429];
    expect((await sender.sendOnce()).kind).toBe("retry");
    expect((await sender.sendOnce()).kind).toBe("retry");
    expect(db.pendingCount()).toBe(2);
  });

  it("treats a 200 that does not acknowledge as a failure", async () => {
    const { db, queue } = await setup();
    await queue(1);
    const sender = createSender({
      db,
      logger: silentLogger,
      config: { ...config, apiUrl: "http://x.test" },
      fetch: async () => new Response("<html>ok</html>", { status: 200 }),
    });
    expect((await sender.sendOnce()).kind).toBe("retry");
    expect(db.pendingCount()).toBe(1);
  });

  it("sets aside a single event the API calls malformed, without blocking the rest", async () => {
    const { db, queue } = await setup();
    await queue(3);
    const bad = db.pending(10)[1];
    const seen: number[] = [];
    const sender = createSender({
      db,
      logger: silentLogger,
      config: { ...config, apiUrl: "http://x.test" },
      fetch: async (_url, init) => {
        const events = JSON.parse(String(init?.body)).events as { seq: number }[];
        if (events.some((e) => e.seq === bad?.seq)) return new Response("{}", { status: 400 });
        seen.push(...events.map((e) => e.seq));
        return new Response(
          JSON.stringify({ ok: true, ackedSeq: Math.max(...events.map((e) => e.seq)) }),
          { status: 200 },
        );
      },
    });
    for (let n = 0; n < 20 && db.pendingCount() > 0; n += 1) await sender.sendOnce();
    expect(db.pendingCount()).toBe(0);
    expect(seen).toHaveLength(2);
    expect(seen).not.toContain(bad?.seq);
  });

  it("delivers a snapshot as its own request, after the events before it", async () => {
    const { api, db, cfg, queue, drain } = await setup({ snapshotIntervalS: 1 });
    await queue(2);
    db.setMeta("last_snapshot_ms", "0");
    await pollOnce({
      ecw: fakeEcw([machine("m0"), machine("m1")]),
      db,
      logger: silentLogger,
      config: cfg,
      now: () => Date.UTC(2026, 10, 10, 12, 0, 0) + 60_000,
    });
    await drain();
    expect(api.received.map((r) => JSON.parse(r.body).kind)).toEqual(["events", "snapshot"]);
  });
});

describe("the running service", () => {
  it("rides out an outage and still delivers everything, once, in order", async () => {
    const api = await fakeApi();
    closers.push(api.close);
    const db = memoryDb();
    const ecw = fakeEcw([machine("m1")]);
    const cfg = { ...config, apiUrl: api.url, snapshotIntervalS: 100_000 };
    api.control.failNext = [503, 503, 503];
    const sender = createSender({ db, logger: silentLogger, config: cfg });
    const service = createService({
      config: cfg,
      db,
      ecw,
      sender,
      logger: silentLogger,
      backoff: () => 10,
      idleWaitMs: 10,
      pollEveryMs: 50,
    });
    service.start();
    const until = async (done: () => boolean) => {
      for (let n = 0; n < 300 && !done(); n += 1) await new Promise((r) => setTimeout(r, 10));
      expect(done()).toBe(true);
    };
    await until(() => api.stored.size === 1);
    ecw.state.machines = [machine("m1", { state: "suspended" }), machine("m2")];
    await until(() => api.stored.size === 3);
    await service.stop();
    expect(db.pendingCount()).toBe(0);
    expect(service.status()).toMatchObject({ pending: 0, consecutiveSendFailures: 0 });
    expect(service.status().lastDeliveryOkAt).not.toBeNull();
    expect(api.received.some((r) => r.verdict !== "ok")).toBe(false);
  });
});
