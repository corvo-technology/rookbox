import { describe, expect, it } from "vitest";
import { silentLogger } from "../logger.js";
import { createIngestHandler } from "./ingest.js";
import {
  REPORTER_HEADER,
  SIGNATURE_HEADER,
  signBody,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./signature.js";
import { at, ev, events, newUsage, resetSeq, T0 } from "./test-support.js";

const SECRET = "s".repeat(40);
const NOW_MS = T0 + 3_600_000;

function setup(secret: string | undefined = SECRET) {
  resetSeq();
  const usage = newUsage();
  const handler = createIngestHandler({
    secret,
    usage: usage.service,
    logger: silentLogger,
    now: () => NOW_MS,
  });
  const send = (
    message: unknown,
    options: { secret?: string; timestamp?: string; reporter?: string; body?: string } = {},
  ) => {
    const body = options.body ?? JSON.stringify(message);
    const timestamp = options.timestamp ?? String(Math.floor(NOW_MS / 1000));
    return handler(
      new Request("http://api.test/ingest/usage-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signBody(options.secret ?? SECRET, timestamp, body),
          [REPORTER_HEADER]: options.reporter ?? "rep1",
        },
        body,
      }),
    );
  };
  return { ...usage, handler, send };
}

describe("verifySignature", () => {
  const base = { secret: SECRET, body: "{}", nowMs: 1_000_000_000 };
  const ts = "1000000";
  it("accepts a good signature inside the window", () => {
    expect(verifySignature({ ...base, timestamp: ts, signature: signBody(SECRET, ts, "{}") })).toBe(
      "ok",
    );
  });
  it("refuses a different body, a different secret and a malformed signature", () => {
    expect(
      verifySignature({ ...base, timestamp: ts, signature: signBody(SECRET, ts, "{ }") }),
    ).toBe("invalid");
    expect(
      verifySignature({ ...base, timestamp: ts, signature: signBody("x".repeat(40), ts, "{}") }),
    ).toBe("invalid");
    expect(verifySignature({ ...base, timestamp: ts, signature: "sha256=00" })).toBe("invalid");
    expect(verifySignature({ ...base, timestamp: "abc", signature: "x" })).toBe("invalid");
  });
  it("refuses a request without the headers, or one outside the time window", () => {
    expect(verifySignature({ ...base, timestamp: null, signature: null })).toBe("missing");
    const old = "999999000";
    expect(
      verifySignature({ ...base, timestamp: old, signature: signBody(SECRET, old, "{}") }),
    ).toBe("stale");
    const future = "1000001000";
    expect(
      verifySignature({ ...base, timestamp: future, signature: signBody(SECRET, future, "{}") }),
    ).toBe("stale");
  });
});

describe("POST /ingest/usage-events", () => {
  it("is off without a secret", async () => {
    const { send } = setup("");
    expect((await send(events([ev("seen", "m1", 0)]))).status).toBe(503);
  });

  it("stores a signed batch and answers with the highest sequence number", async () => {
    const { send, store } = setup();
    const response = await send(events([ev("seen", "m1", 0), ev("suspended", "m1", 60)]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ackedSeq: 2, accepted: 2, duplicates: 0 });
    expect(store.events).toHaveLength(2);
    expect(store.intervals().map((row) => row.state)).toEqual(["running", "suspended"]);
  });

  it("refuses a wrong secret, a missing signature and a tampered body", async () => {
    const { send, store, handler } = setup();
    const message = events([ev("seen", "m1", 0)]);
    expect((await send(message, { secret: "y".repeat(40) })).status).toBe(401);
    const unsigned = await handler(
      new Request("http://api.test/ingest/usage-events", { method: "POST", body: "{}" }),
    );
    expect(unsigned.status).toBe(401);
    const body = JSON.stringify(message);
    const timestamp = String(Math.floor(NOW_MS / 1000));
    const tampered = await handler(
      new Request("http://api.test/ingest/usage-events", {
        method: "POST",
        headers: {
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signBody(SECRET, timestamp, body),
          [REPORTER_HEADER]: "rep1",
        },
        body: body.replace('"m1"', '"m2"'),
      }),
    );
    expect(tampered.status).toBe(401);
    expect(store.events).toHaveLength(0);
  });

  it("refuses a replay older than the window, even with a valid signature", async () => {
    const { send, store } = setup();
    const old = String(Math.floor(NOW_MS / 1000) - 3_600);
    expect((await send(events([ev("seen", "m1", 0)]), { timestamp: old })).status).toBe(401);
    expect(store.events).toHaveLength(0);
  });

  it("takes a replay inside the window as a success that stores nothing twice", async () => {
    const { send, store } = setup();
    const message = events([ev("seen", "m1", 0), ev("suspended", "m1", 60)]);
    await send(message);
    const again = await send(message);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, ackedSeq: 2, accepted: 0, duplicates: 2 });
    expect(store.events).toHaveLength(2);
    expect(store.intervals()).toHaveLength(2);
  });

  it("derives the same intervals when events arrive out of order across requests", async () => {
    const first = setup();
    const a = [ev("seen", "m1", 0), ev("suspended", "m1", 60), ev("resumed", "m1", 120)];
    await first.send(events([a[2] as (typeof a)[0]]));
    await first.send(events([a[0] as (typeof a)[0]]));
    await first.send(events([a[1] as (typeof a)[0]]));
    const second = setup();
    await second.send(events(a));
    const shape = (rows: ReturnType<typeof first.store.intervals>) =>
      rows
        .map((row) => [row.state, row.startedAt.toISOString(), row.endedAt?.toISOString() ?? null])
        .sort();
    expect(shape(first.store.intervals())).toEqual(shape(second.store.intervals()));
    expect(first.store.intervals()).toHaveLength(3);
  });

  it("refuses malformed bodies and a reporter id that disagrees with the header", async () => {
    const { send } = setup();
    expect((await send({ kind: "nope" })).status).toBe(400);
    expect((await send(null, { body: "not json" })).status).toBe(400);
    expect((await send(events([ev("seen", "m1", 0)]), { reporter: "other" })).status).toBe(400);
    expect((await send({ kind: "events", reporterId: "rep1", events: [] })).status).toBe(400);
  });

  it("refuses a body that is too large", async () => {
    const { handler } = setup();
    const response = await handler(
      new Request("http://api.test/ingest/usage-events", {
        method: "POST",
        headers: { "content-length": String(10 * 1024 * 1024) },
        body: "{}",
      }),
    );
    expect(response.status).toBe(413);
  });

  it("records that the reporter got through, with its sequence and precision", async () => {
    const { send, store } = setup();
    await send({ ...events([ev("seen", "m1", 0)]), pollIntervalS: 45 });
    const [row] = await store.reporters();
    expect(row).toMatchObject({ id: "rep1", lastSeq: 1, pollIntervalS: 45 });
    expect(row?.lastEventAt).toEqual(new Date(T0 + 3_600_000));
    expect(at(0)).toBeTruthy();
  });
});
